import { Injectable } from '@nestjs/common';
import { OrderPaymentStatus, OrderStatus, Prisma } from '@prisma/client';
import { AppNotificationsService } from '../../queue/services/app-notifications.service';
import { SocketEmitService } from '../../gateway/services/socket-emit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { throwApi } from '../../common/exceptions/api.exception';
import { SubscriptionEntitlementService } from '../../subscriptions/services/subscription-entitlement.service';
import {
  BUTCHER_ORDER_COMMISSION_PERCENT,
  butcherOrderCommissionPaymentRef,
  calculateOrderCommission,
} from '../../lib/commissions';
import { OrderStateMachineService } from './order-state-machine.service';
import { ButcherRankingService } from './butcher-ranking.service';
import type { ValidatedOrderLine } from '../lib/order-line.util';
import { nextButcherOrderNumber } from '../lib/order-number.util';
import {
  DEFAULT_CHECKOUT_TTL_MINUTES,
  checkoutItemsEqual,
  createCheckoutWithReservations,
  fulfillPaidCheckout,
  lockCheckoutRow,
  releaseCheckoutReservations,
  type PaidCheckoutOrder,
} from '../lib/butcher-checkout.lifecycle';

type CreateOrderInput = {
  butcherId: string;
  customerId: string;
  deliveryType: string;
  deliveryAddress?: string | null;
  notes?: string | null;
  currency: string;
  totalPrice: number;
  items: ValidatedOrderLine[];
};

type LockedOrderRow = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  productId: string;
  customerId: string;
  reservedQuantity: number;
  butcherId: string;
  butcherUserId: string;
  totalPrice: number;
  currency: string;
};

type OrderInventoryLine = {
  productId: string;
  reservedQuantity: number;
};

const SYSTEM_ORDER_EXPIRY_ACTOR = 'system:unpaid-order-expiry';
const UNPAID_ORDER_EXPIRED_REASON =
  'انتهت مهلة الدفع لهذا الطلب وتم تحرير الكمية المحجوزة';

@Injectable()
export class OrderLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: OrderStateMachineService,
    private readonly notifications: AppNotificationsService,
    private readonly sockets: SocketEmitService,
    private readonly ranking: ButcherRankingService,
    private readonly entitlements: SubscriptionEntitlementService,
  ) {}

  private statusMsg(status: OrderStatus): string {
    const map: Record<OrderStatus, string> = {
      pending: 'تم استلام طلبك',
      confirmed: 'تم تأكيد طلبك',
      preparing: 'طلبك قيد التحضير',
      ready: 'طلبك جاهز للاستلام/التوصيل',
      delivered: 'تم تسليم طلبك بنجاح',
      cancelled: 'تم إلغاء طلبك',
    };
    return map[status];
  }

  private async staffUserIds(): Promise<string[]> {
    const staff = await this.prisma.user.findMany({
      take: 200,
      where: {
        role: { in: ['ADMIN', 'MODERATOR'] },
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    return staff.map((s) => s.id);
  }

  private emitOrderSockets(
    customerId: string,
    butcherUserId: string,
    event: string,
    payload: Record<string, unknown>,
  ) {
    this.sockets.emitToUser(customerId, event, payload);
    this.sockets.emitToUser(butcherUserId, event, payload);
    this.sockets.getServer()?.emit(`admin.${event}`, payload);
  }

  private async notifyOrderParties(params: {
    customerId: string;
    butcherUserId: string;
    orderId: string;
    orderNumber: string;
    butcherId: string;
    status: OrderStatus;
    titleAr?: string;
    bodyAr?: string;
    type?: 'order_update' | 'system';
  }) {
    const bodyAr = params.bodyAr ?? this.statusMsg(params.status);
    const titleAr = params.titleAr ?? `طلب ${params.orderNumber}`;
    const data = {
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      status: params.status,
      butcherId: params.butcherId,
    };

    const staffIds = await this.staffUserIds();
    const recipients = [
      ...new Set([params.customerId, params.butcherUserId, ...staffIds]),
    ];

    await this.notifications.notifyUsers(recipients, {
      type: params.type ?? 'order_update',
      titleAr,
      bodyAr,
      data,
    });
  }

  private async notifyOrderStatus(
    customerId: string,
    butcherUserId: string,
    payload: {
      orderId: string;
      orderNumber: string;
      butcherId: string;
      status: OrderStatus;
      timeline: { status: OrderStatus; note: string | null; createdAt: Date };
    },
  ) {
    this.emitOrderSockets(customerId, butcherUserId, 'order.updated', payload);
    this.sockets.emitToUser(customerId, 'order:updated', {
      orderId: payload.orderId,
      status: payload.status,
    });
    this.emitOrderSockets(
      customerId,
      butcherUserId,
      'order.timeline.updated',
      payload.timeline,
    );

    await this.notifyOrderParties({
      customerId,
      butcherUserId,
      orderId: payload.orderId,
      orderNumber: payload.orderNumber,
      butcherId: payload.butcherId,
      status: payload.status,
    });
  }

  private async lockOrderRow(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<LockedOrderRow | null> {
    const rows = await tx.$queryRaw<LockedOrderRow[]>`
      SELECT
        o.id,
        o."orderNumber" AS "orderNumber",
        o.status,
        o."paymentStatus" AS "paymentStatus",
        o."productId" AS "productId",
        o."customerId" AS "customerId",
        o."reservedQuantity" AS "reservedQuantity",
        o."butcherId" AS "butcherId",
        b."userId" AS "butcherUserId",
        o."totalPrice" AS "totalPrice",
        o.currency AS currency
      FROM "ButcherOrder" o
      INNER JOIN "Butcher" b ON b.id = o."butcherId"
      WHERE o.id = ${orderId}
      FOR UPDATE OF o
    `;
    return rows[0] ?? null;
  }

  /**
   * Accrue order commission once when a butcher order reaches `delivered`.
   * Idempotent via Payment(referenceType=order_commission, referenceId=orderId)
   * and unique merchant orderId BOC-{orderId}. Does not use ListingFee.
   */
  private async recordOrderCommissionIfNeeded(
    tx: Prisma.TransactionClient,
    locked: LockedOrderRow,
  ): Promise<void> {
    // Only paid completed orders — never pending / failed / unpaid.
    if (locked.paymentStatus !== 'paid') return;

    const existing = await tx.payment.findFirst({
      where: {
        referenceType: { in: ['order_commission', 'commission'] },
        referenceId: locked.id,
      },
      select: { id: true },
    });
    if (existing) return;

    const permissions = await this.entitlements.getPermissionsForUser(
      locked.butcherUserId,
    );
    const calc = calculateOrderCommission(
      Number(locked.totalPrice),
      permissions,
    );
    const paymentOrderId = butcherOrderCommissionPaymentRef(locked.id);

    try {
      await tx.payment.create({
        data: {
          userId: locked.butcherUserId,
          orderId: paymentOrderId,
          amount: calc.commission,
          currency: locked.currency || 'SAR',
          // Ledger accrual — not a customer gateway charge.
          method: 'mada',
          status: 'paid',
          paidAt: new Date(),
          referenceType: 'order_commission',
          referenceId: locked.id,
          description: 'Butcher order commission',
          descriptionAr: 'عمولة طلب ملحمة',
          metadata: {
            kind: 'butcher_order_commission',
            ledgerOnly: true,
            butcherOrderId: locked.id,
            orderNumber: locked.orderNumber,
            orderTotal: Number(locked.totalPrice),
            // Admin/audit only — butcher-facing APIs must not surface this rate.
            ratePercent: BUTCHER_ORDER_COMMISSION_PERCENT,
            isExempt: calc.isExempt,
          },
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return;
      }
      throw err;
    }
  }

  private async loadInventoryLines(
    tx: Prisma.TransactionClient,
    orderId: string,
    locked: LockedOrderRow,
  ): Promise<OrderInventoryLine[]> {
    const items = await tx.butcherOrderItem.findMany({
      take: 200,
      where: { orderId },
      select: { productId: true, reservedQuantity: true },
    });
    if (items.length > 0) {
      return items.map((item) => ({
        productId: item.productId,
        reservedQuantity: item.reservedQuantity,
      }));
    }
    if (locked.reservedQuantity > 0) {
      return [
        {
          productId: locked.productId,
          reservedQuantity: locked.reservedQuantity,
        },
      ];
    }
    return [];
  }

  private async releaseReservedInventory(
    tx: Prisma.TransactionClient,
    lines: OrderInventoryLine[],
  ) {
    for (const line of lines) {
      if (line.reservedQuantity <= 0) continue;
      await tx.$executeRaw`
        UPDATE "ButcherProduct"
        SET "reservedQuantity" = GREATEST("reservedQuantity" - ${line.reservedQuantity}, 0)
        WHERE "id" = ${line.productId}
      `;
    }
  }

  private async finalizeDeliveredInventory(
    tx: Prisma.TransactionClient,
    lines: OrderInventoryLine[],
  ) {
    for (const line of lines) {
      if (line.reservedQuantity <= 0) continue;
      const affected = await tx.$executeRaw`
        UPDATE "ButcherProduct"
        SET "reservedQuantity" = GREATEST("reservedQuantity" - ${line.reservedQuantity}, 0),
            "availableQuantity" = GREATEST("availableQuantity" - ${line.reservedQuantity}, 0)
        WHERE "id" = ${line.productId}
          AND "reservedQuantity" >= ${line.reservedQuantity}
      `;
      if (affected === 0) {
        throwApi(409, 'inventory_conflict', 'تعذر تحديث المخزون للطلب');
      }
    }
  }

  async createOrder(input: CreateOrderInput) {
    if (!input.items.length) {
      throwApi(
        400,
        'validation_error',
        'يجب أن يحتوي الطلب على منتج واحد على الأقل',
      );
    }

    const firstItem = input.items[0];
    const created = await this.prisma.$transaction(
      async (tx) => {
        for (const item of input.items) {
          const productLock = await tx.$executeRaw`
          UPDATE "ButcherProduct"
          SET "reservedQuantity" = "reservedQuantity" + ${item.reservedQuantity}
          WHERE "id" = ${item.productId}
            AND "inStock" = true
            AND ("availableQuantity" - "reservedQuantity") >= ${item.reservedQuantity}
        `;
          if (productLock === 0) {
            throwApi(409, 'insufficient_inventory', 'الكمية غير متوفرة حالياً');
          }
        }

        const orderNumber = await nextButcherOrderNumber(tx);

        const order = await tx.butcherOrder.create({
          data: {
            butcherId: input.butcherId,
            customerId: input.customerId,
            productId: firstItem.productId,
            cutType: firstItem.cutType,
            weightKg: firstItem.weightKg,
            reservedQuantity: firstItem.reservedQuantity,
            deliveryType: input.deliveryType,
            deliveryAddress: input.deliveryAddress,
            notes: input.notes,
            currency: input.currency,
            totalPrice: input.totalPrice,
            orderNumber,
            status: 'pending',
            paymentStatus: 'unpaid',
            items: {
              create: input.items.map((item) => ({
                productId: item.productId,
                cutType: item.cutType,
                weightKg: item.weightKg,
                linePrice: item.linePrice,
                reservedQuantity: item.reservedQuantity,
              })),
            },
          },
          include: {
            butcher: { select: { id: true, userId: true, nameAr: true } },
            product: {
              include: { daftraLink: { select: { daftraSaleUnit: true } } },
            },
            items: {
              include: {
                product: {
                  include: { daftraLink: { select: { daftraSaleUnit: true } } },
                },
              },
            },
          },
        });

        const timeline = await tx.orderTimeline.create({
          data: {
            orderId: order.id,
            status: 'pending',
            note: 'Order Created — awaiting payment',
            createdBy: input.customerId,
          },
        });

        return { order, timeline };
      },
      { maxWait: 10000, timeout: 30000 },
    );

    this.emitOrderSockets(
      created.order.customerId,
      created.order.butcher.userId,
      'order.created',
      {
        orderId: created.order.id,
        orderNumber: created.order.orderNumber,
        status: created.order.status,
        paymentStatus: created.order.paymentStatus,
        butcherId: created.order.butcher.id,
        customerId: created.order.customerId,
      },
    );

    await this.notifications.notifyUser({
      userId: created.order.customerId,
      type: 'order_update',
      titleAr: `طلب ${created.order.orderNumber}`,
      bodyAr: 'أكمل الدفع عبر بوابة المنصة لتأكيد الطلب',
      data: {
        orderId: created.order.id,
        orderNumber: created.order.orderNumber,
        status: created.order.status,
        paymentStatus: created.order.paymentStatus,
        butcherId: created.order.butcher.id,
      },
    });

    return created.order;
  }

  checkoutTtlMinutes(): number {
    const parsed = Number.parseInt(
      process.env.BUTCHER_ORDER_UNPAID_EXPIRES_MINUTES || '',
      10,
    );
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_CHECKOUT_TTL_MINUTES;
  }

  async createCheckoutAttempt(input: CreateOrderInput) {
    if (!input.items.length) {
      throwApi(
        400,
        'validation_error',
        'يجب أن يحتوي الطلب على منتج واحد على الأقل',
      );
    }

    const expiresAt = new Date(
      Date.now() + this.checkoutTtlMinutes() * 60 * 1000,
    );

    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.butcherCheckout.findFirst({
          where: {
            userId: input.customerId,
            butcherId: input.butcherId,
            status: 'pending',
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existing) {
          const locked = await lockCheckoutRow(tx, existing.id);
          if (
            locked &&
            locked.status === 'pending' &&
            locked.expiresAt > new Date() &&
            checkoutItemsEqual(existing.itemsSnapshot, input.items) &&
            existing.totalPrice === input.totalPrice
          ) {
            return { checkout: existing, reused: true as const };
          }
          if (locked?.status === 'pending') {
            await releaseCheckoutReservations(tx, existing.id, 'cancelled');
          }
        }

        try {
          const checkout = await createCheckoutWithReservations(tx, {
            userId: input.customerId,
            butcherId: input.butcherId,
            deliveryType: input.deliveryType,
            deliveryAddress: input.deliveryAddress,
            notes: input.notes,
            currency: input.currency,
            totalPrice: input.totalPrice,
            items: input.items,
            expiresAt,
          });
          return { checkout, reused: false as const };
        } catch (err) {
          const prismaErr = err as { code?: string };
          if (prismaErr.code === 'P2002') {
            const raced = await tx.butcherCheckout.findFirst({
              where: {
                userId: input.customerId,
                butcherId: input.butcherId,
                status: 'pending',
              },
              orderBy: { createdAt: 'desc' },
            });
            if (raced) return { checkout: raced, reused: true as const };
          }
          throw err;
        }
      },
      { maxWait: 10000, timeout: 30000 },
    );
  }

  async linkCheckoutPayment(checkoutId: string, paymentId: string) {
    return this.prisma.butcherCheckout.updateMany({
      where: { id: checkoutId, status: 'pending' },
      data: { paymentId },
    });
  }

  findOrderByPaymentId(paymentId: string) {
    return this.prisma.butcherOrder.findUnique({
      where: { paymentId },
      select: {
        id: true,
        orderNumber: true,
        butcherId: true,
        status: true,
        paymentStatus: true,
      },
    });
  }

  async abandonCheckout(userId: string, checkoutId: string) {
    return this.prisma.$transaction(async (tx) => {
      const checkout = await tx.butcherCheckout.findFirst({
        where: { id: checkoutId, userId },
        select: { id: true, status: true, paymentId: true },
      });
      if (!checkout) throwApi(404, 'not_found', 'محاولة الدفع غير موجودة');
      if (checkout.status !== 'pending') {
        return { released: false, status: checkout.status };
      }
      const released = await releaseCheckoutReservations(
        tx,
        checkout.id,
        'cancelled',
      );
      if (checkout.paymentId) {
        await tx.payment.updateMany({
          where: { id: checkout.paymentId, status: 'pending' },
          data: { status: 'failed' },
        });
      }
      return { released: released.released, status: 'cancelled' as const };
    });
  }

  async expireStaleCheckouts(cutoff: Date, limit = 50) {
    const candidates = await this.prisma.butcherCheckout.findMany({
      where: {
        status: 'pending',
        OR: [
          { expiresAt: { lte: cutoff } },
          { expiresAt: { lte: new Date() } },
        ],
      },
      orderBy: { expiresAt: 'asc' },
      take: limit,
      select: { id: true, paymentId: true },
    });

    let expired = 0;
    let skipped = 0;
    for (const candidate of candidates) {
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const released = await releaseCheckoutReservations(
            tx,
            candidate.id,
            'expired',
          );
          if (released.released && candidate.paymentId) {
            await tx.payment.updateMany({
              where: { id: candidate.paymentId, status: 'pending' },
              data: { status: 'failed' },
            });
          }
          return released;
        });
        if (result.released) expired += 1;
        else skipped += 1;
      } catch {
        skipped += 1;
      }
    }

    return { scanned: candidates.length, expired, skipped };
  }

  fulfillPaidCheckoutInTransaction(
    tx: Prisma.TransactionClient,
    params: { checkoutId: string; paymentId: string; userId: string },
  ): Promise<{
    butcherOrder?: PaidCheckoutOrder;
    capturedAfterCancel?: boolean;
    created: boolean;
  }> {
    return fulfillPaidCheckout(tx, params);
  }

  async expireStaleUnpaidOrders(cutoff: Date, limit = 50) {
    const candidates = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT o.id
      FROM "ButcherOrder" o
      WHERE o.status = 'pending'
        AND o."paymentStatus" IN ('unpaid', 'failed')
        AND o."createdAt" < ${cutoff}
      ORDER BY o."createdAt" ASC
      LIMIT ${limit}
    `;

    let expired = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      try {
        const result = await this.transitionOrder({
          orderId: candidate.id,
          actorId: SYSTEM_ORDER_EXPIRY_ACTOR,
          nextStatus: 'cancelled',
          cancellationReason: UNPAID_ORDER_EXPIRED_REASON,
        });
        if (result.status === 'cancelled') {
          expired += 1;
        } else {
          skipped += 1;
        }
      } catch {
        skipped += 1;
      }
    }

    return {
      scanned: candidates.length,
      expired,
      skipped,
    };
  }

  async transitionOrder(params: {
    orderId: string;
    actorId: string;
    nextStatus: OrderStatus;
    cancellationReason?: string | null;
  }) {
    const updated = await this.prisma.$transaction(
      async (tx) => {
        const locked = await this.lockOrderRow(tx, params.orderId);
        if (!locked) throwApi(404, 'not_found', 'الطلب غير موجود');

        if (locked.status === params.nextStatus) {
          const order = await tx.butcherOrder.findUnique({
            where: { id: params.orderId },
            include: {
              butcher: { select: { id: true, userId: true } },
              items: {
                include: {
                  product: {
                    include: {
                      daftraLink: { select: { daftraSaleUnit: true } },
                    },
                  },
                },
              },
            },
          });
          if (!order) throwApi(404, 'not_found', 'الطلب غير موجود');
          return {
            order,
            timeline: null,
            noop: true as const,
            locked,
            inventoryLines: [] as OrderInventoryLine[],
          };
        }

        this.stateMachine.assertTransition(locked.status, params.nextStatus);

        if (
          params.nextStatus === 'confirmed' &&
          locked.paymentStatus !== 'paid'
        ) {
          throwApi(
            402,
            'payment_required',
            'لا يمكن تأكيد الطلب قبل إتمام الدفع عبر بوابة المنصة',
          );
        }

        const inventoryLines = await this.loadInventoryLines(
          tx,
          params.orderId,
          locked,
        );

        if (params.nextStatus === 'cancelled') {
          await this.releaseReservedInventory(tx, inventoryLines);
          await tx.payment.updateMany({
            where: {
              referenceType: 'butcher_order',
              referenceId: params.orderId,
              status: 'pending',
            },
            data: { status: 'failed' },
          });
        }

        if (params.nextStatus === 'delivered') {
          await this.finalizeDeliveredInventory(tx, inventoryLines);
          await this.recordOrderCommissionIfNeeded(tx, locked);
        }

        const order = await tx.butcherOrder.update({
          where: { id: params.orderId },
          data: {
            status: params.nextStatus,
            ...(params.nextStatus === 'cancelled'
              ? {
                  cancelledBy: params.actorId,
                  cancellationReason: params.cancellationReason ?? null,
                  cancelledAt: new Date(),
                }
              : {}),
          },
          include: {
            butcher: { select: { id: true, userId: true } },
            items: {
              include: {
                product: {
                  include: { daftraLink: { select: { daftraSaleUnit: true } } },
                },
              },
            },
          },
        });

        const timeline = await tx.orderTimeline.create({
          data: {
            orderId: params.orderId,
            status: params.nextStatus,
            note:
              params.nextStatus === 'cancelled'
                ? (params.cancellationReason ?? 'Order Cancelled')
                : null,
            createdBy: params.actorId,
          },
        });

        await tx.orderStatusAudit.create({
          data: {
            orderId: params.orderId,
            previousStatus: locked.status,
            newStatus: params.nextStatus,
            changedBy: params.actorId,
          },
        });

        return {
          order,
          timeline,
          noop: false as const,
          locked,
          inventoryLines,
        };
      },
      { maxWait: 10000, timeout: 30000 },
    );

    if (updated.noop) {
      return updated.order;
    }

    const locked = updated.locked;
    const timeline = updated.timeline!;

    for (const line of updated.inventoryLines) {
      this.emitOrderSockets(
        locked.customerId,
        locked.butcherUserId,
        'inventory.updated',
        { productId: line.productId },
      );
    }

    await this.notifyOrderStatus(locked.customerId, locked.butcherUserId, {
      orderId: updated.order.id,
      orderNumber: updated.order.orderNumber,
      butcherId: updated.order.butcher.id,
      status: updated.order.status,
      timeline: {
        status: timeline.status,
        note: timeline.note,
        createdAt: timeline.createdAt,
      },
    });

    if (updated.order.status === 'cancelled') {
      this.emitOrderSockets(
        locked.customerId,
        locked.butcherUserId,
        'order.cancelled',
        {
          orderId: updated.order.id,
          orderNumber: updated.order.orderNumber,
        },
      );
      void this.ranking.onOrderCancelled(updated.order.butcher.id);
    }

    if (updated.order.status === 'delivered') {
      void this.ranking.onOrderDelivered(updated.order.butcher.id);
    }

    return updated.order;
  }
}
