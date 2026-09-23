import { Injectable } from '@nestjs/common';
import { PaymentReferenceType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPermissions, normalizePlanSlug } from '../../plans/plan.types';
import {
  fulfillPaidCheckout,
  releaseCheckoutReservations,
} from '../../butchers/lib/butcher-checkout.lifecycle';

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findSubscriptionForPayment(referenceId: string, userId: string) {
    return this.prisma.subscription.findFirst({
      where: { id: referenceId, userId },
      select: {
        id: true,
        planId: true,
        planAudience: true,
        renewDate: true,
        autoRenew: true,
      },
    });
  }

  findPendingFee(referenceId: string, userId: string) {
    return this.prisma.listingFee.findFirst({
      where: {
        userId,
        status: { in: ['pending', 'overdue'] },
        OR: [{ id: referenceId }, { listingId: referenceId }],
      },
      select: {
        id: true,
        listingId: true,
        commission: true,
        saleAmount: true,
        status: true,
      },
    });
  }

  recordListingFeeSaleAmount(
    feeId: string,
    userId: string,
    saleAmount: number,
    commission: number,
  ) {
    return this.prisma.listingFee.updateMany({
      where: {
        id: feeId,
        userId,
        status: { in: ['pending', 'overdue'] },
      },
      data: {
        saleAmount,
        saleDeclaredAt: new Date(),
        commission,
      },
    });
  }

  findOwnedListingForCommission(referenceId: string, userId: string) {
    return this.prisma.listing.findFirst({
      where: {
        id: referenceId,
        sellerId: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        fee: {
          select: {
            id: true,
            status: true,
            commission: true,
            dueDate: true,
          },
        },
      },
    });
  }

  findUnpaidButcherOrder(referenceId: string, userId: string) {
    return this.prisma.butcherOrder.findFirst({
      where: {
        id: referenceId,
        customerId: userId,
        status: 'pending',
        paymentStatus: { in: ['unpaid', 'failed'] },
      },
      select: {
        id: true,
        totalPrice: true,
        currency: true,
        orderNumber: true,
        butcherId: true,
        status: true,
        paymentStatus: true,
        butcher: { select: { userId: true, nameAr: true } },
      },
    });
  }

  findPayableButcherCheckout(referenceId: string, userId: string) {
    return this.prisma.butcherCheckout.findFirst({
      where: {
        id: referenceId,
        userId,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        totalPrice: true,
        currency: true,
        status: true,
        expiresAt: true,
        butcherId: true,
        paymentId: true,
      },
    });
  }

  private async findFulfilledButcherOrder(
    tx: Prisma.TransactionClient,
    params: {
      paymentId: string;
      type: string | undefined;
      referenceId: string | undefined;
    },
  ) {
    if (params.type === 'butcher_checkout' && params.referenceId) {
      const order = await tx.butcherOrder.findFirst({
        where: {
          OR: [
            { paymentId: params.paymentId },
            { checkoutId: params.referenceId },
          ],
        },
        select: {
          id: true,
          orderNumber: true,
          butcherId: true,
          customerId: true,
          butcher: { select: { userId: true, nameAr: true } },
        },
      });
      if (!order) return undefined;
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        butcherId: order.butcherId,
        customerId: order.customerId,
        butcherUserId: order.butcher.userId,
        nameAr: order.butcher.nameAr,
      };
    }

    if (params.type === 'butcher_order' && params.referenceId) {
      const order = await tx.butcherOrder.findUnique({
        where: { id: params.referenceId },
        select: {
          id: true,
          orderNumber: true,
          butcherId: true,
          customerId: true,
          butcher: { select: { userId: true, nameAr: true } },
        },
      });
      if (!order) return undefined;
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        butcherId: order.butcherId,
        customerId: order.customerId,
        butcherUserId: order.butcher.userId,
        nameAr: order.butcher.nameAr,
      };
    }

    return undefined;
  }

  findUserContact(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true, arabicName: true },
    });
  }

  findPendingPayment(where: {
    userId: string;
    referenceId: string;
    referenceType: PaymentReferenceType;
  }) {
    return this.prisma.payment.findFirst({
      where: {
        userId: where.userId,
        status: 'pending',
        referenceId: where.referenceId,
        referenceType: where.referenceType,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        checkoutUrl: true,
        orderId: true,
        transactionId: true,
        metadata: true,
        createdAt: true,
      },
    });
  }

  createPendingPayment(params: {
    userId: string;
    orderId: string;
    amount: number;
    currency: string;
    method: string;
    description?: string;
    descriptionAr?: string;
    metadata: Record<string, unknown>;
    referenceId?: string;
    referenceType: PaymentReferenceType;
    subscriptionId?: string;
    feeId?: string;
  }) {
    return this.prisma.payment.create({
      data: {
        userId: params.userId,
        orderId: params.orderId,
        amount: params.amount,
        currency: params.currency,
        method: params.method as Prisma.PaymentCreateInput['method'],
        status: 'pending',
        description: params.description,
        descriptionAr: params.descriptionAr,
        metadata: params.metadata as Prisma.InputJsonValue,
        referenceId: params.referenceId,
        referenceType: params.referenceType,
        ...(params.subscriptionId
          ? { subscriptionId: params.subscriptionId }
          : {}),
        ...(params.feeId ? { feeId: params.feeId } : {}),
      },
    });
  }

  archiveInvalidPendingPayment(
    paymentId: string,
    reason: string,
    extraMetadata?: Record<string, unknown>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { id: paymentId },
        select: {
          metadata: true,
          checkoutUrl: true,
          transactionId: true,
          orderId: true,
        },
      });
      if (!existing) return null;

      const prevMeta = (existing.metadata ?? {}) as Record<string, unknown>;
      return tx.payment.update({
        where: { id: paymentId, status: 'pending' },
        data: {
          status: 'failed',
          metadata: {
            ...prevMeta,
            ...extraMetadata,
            archivedAt: new Date().toISOString(),
            archiveReason: reason,
            previousCheckoutUrl: existing.checkoutUrl,
            previousTransactionId: existing.transactionId,
            previousOrderId: existing.orderId,
          } as Prisma.InputJsonValue,
        },
      });
    });
  }

  createPendingPaymentOrReturnExisting(params: {
    userId: string;
    orderId: string;
    amount: number;
    currency: string;
    method: string;
    description?: string;
    descriptionAr?: string;
    metadata: Record<string, unknown>;
    referenceId?: string;
    referenceType: PaymentReferenceType;
    subscriptionId?: string;
    feeId?: string;
  }) {
    const pendingWhere = {
      userId: params.userId,
      status: 'pending' as const,
      ...(params.referenceId ? { referenceId: params.referenceId } : {}),
      referenceType: params.referenceType,
    };

    return this.prisma.$transaction(async (tx) => {
      const existingPending = params.referenceId
        ? await tx.payment.findFirst({
            where: pendingWhere,
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              checkoutUrl: true,
              orderId: true,
              transactionId: true,
              metadata: true,
              createdAt: true,
            },
          })
        : null;
      if (existingPending) return { existingPending };

      try {
        const payment = await tx.payment.create({
          data: {
            userId: params.userId,
            orderId: params.orderId,
            amount: params.amount,
            currency: params.currency,
            method: params.method as Prisma.PaymentCreateInput['method'],
            status: 'pending',
            description: params.description,
            descriptionAr: params.descriptionAr,
            metadata: params.metadata as Prisma.InputJsonValue,
            referenceId: params.referenceId,
            referenceType: params.referenceType,
            ...(params.subscriptionId
              ? { subscriptionId: params.subscriptionId }
              : {}),
            ...(params.feeId ? { feeId: params.feeId } : {}),
          },
        });
        return { payment };
      } catch (err: unknown) {
        const e = err as { code?: string; meta?: { target?: unknown } };
        const isPendingRefUniqueViolation =
          e?.code === 'P2002' &&
          (String(e?.meta?.target ?? '').includes('referenceId') ||
            String(e?.meta?.target ?? '').includes(
              'Payment_userId_referenceId_referenceType_pending_key',
            ));
        if (isPendingRefUniqueViolation) {
          const racedPending = await tx.payment.findFirst({
            where: pendingWhere,
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              checkoutUrl: true,
              orderId: true,
              transactionId: true,
              metadata: true,
              createdAt: true,
            },
          });
          if (racedPending) return { existingPending: racedPending };
        }
        throw err;
      }
    });
  }

  markPaymentFailed(paymentId: string) {
    return this.prisma.payment.updateMany({
      where: { id: paymentId, status: 'pending' },
      data: { status: 'failed' },
    });
  }

  updatePaymentCheckout(
    paymentId: string,
    data: {
      transactionId: string;
      checkoutUrl: string;
      metadata: Record<string, unknown>;
    },
  ) {
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        transactionId: data.transactionId,
        checkoutUrl: data.checkoutUrl,
        metadata: data.metadata as Prisma.InputJsonValue,
      },
    });
  }

  findPaymentForWebhook(
    internalPaymentId: string | undefined,
    merchantOrderRef: string,
  ) {
    return this.prisma.payment.findFirst({
      where: internalPaymentId
        ? { id: internalPaymentId }
        : { orderId: merchantOrderRef },
    });
  }

  processSuccessfulPayment(params: {
    paymentId: string;
    niTransactionId: string;
    type: string | undefined;
    referenceId: string | undefined;
    userId: string;
    targetPlanId: string | undefined;
    billingCycle: string;
    storedMeta: Record<string, unknown>;
  }): Promise<{
    processed: boolean;
    subscription?: { targetPlanId: string; newRenewDate: Date };
    capturedAfterCancel?: boolean;
    butcherOrder?: {
      id: string;
      orderNumber: string;
      butcherId: string;
      customerId: string;
      butcherUserId: string;
      nameAr: string;
    };
    boost?: {
      id: string;
      boostType: string;
      listingId: string;
      expiresAt: Date;
    };
    promotion?: {
      id: string;
      listingId: string;
      expiresAt: Date;
    };
  }> {
    return this.prisma.$transaction(async (tx) => {
      if (params.type === 'butcher_checkout' && params.referenceId) {
        return this.fulfillButcherCheckoutAfterNiSuccess(tx, {
          paymentId: params.paymentId,
          niTransactionId: params.niTransactionId,
          type: params.type,
          referenceId: params.referenceId,
          userId: params.userId,
          storedMeta: params.storedMeta,
        });
      }

      if (params.type === 'butcher_order' && params.referenceId) {
        const existingOrder = await tx.butcherOrder.findUnique({
          where: { id: params.referenceId },
          select: { id: true, status: true },
        });
        if (!existingOrder) {
          throw new Error('Butcher order not found for payment fulfillment');
        }
        if (existingOrder.status === 'cancelled') {
          const current = await tx.payment.findUnique({
            where: { id: params.paymentId },
            select: { status: true, metadata: true },
          });
          if (current?.status === 'paid' || current?.status === 'refunded') {
            return { processed: false, capturedAfterCancel: true };
          }
          const prevMeta = (current?.metadata ?? {}) as Record<string, unknown>;
          await tx.payment.updateMany({
            where: {
              id: params.paymentId,
              status: { in: ['pending', 'failed'] },
            },
            data: {
              status: 'paid',
              transactionId: params.niTransactionId,
              paidAt: new Date(),
              metadata: {
                ...prevMeta,
                ...params.storedMeta,
                capturedAfterCancel: true,
                needsReconciliation: true,
                capturedAfterCancelAt: new Date().toISOString(),
              } as Prisma.InputJsonValue,
            },
          });
          return { processed: false, capturedAfterCancel: true };
        }
      }

      const updated = await tx.payment.updateMany({
        where: { id: params.paymentId, status: 'pending' },
        data: {
          status: 'paid',
          transactionId: params.niTransactionId,
          paidAt: new Date(),
        },
      });
      if (updated.count === 0) {
        const existingPaidOrder = await this.findFulfilledButcherOrder(tx, {
          paymentId: params.paymentId,
          type: params.type,
          referenceId: params.referenceId,
        });
        return {
          processed: false,
          butcherOrder: existingPaidOrder,
        };
      }

      let subscriptionResult:
        { targetPlanId: string; newRenewDate: Date } | undefined;

      if (params.type === 'subscription' && params.referenceId) {
        if (params.storedMeta.subscriptionFulfilled === true) {
          return { processed: true };
        }

        const sub = await tx.subscription.findUnique({
          where: { id: params.referenceId },
          select: { id: true, renewDate: true },
        });
        if (!sub) {
          throw new Error('Subscription not found for payment fulfillment');
        }

        const now = new Date();
        const renewDays = params.billingCycle === 'yearly' ? 365 : 30;
        const msPerDay = 24 * 60 * 60 * 1000;
        const baseDate = sub.renewDate > now ? sub.renewDate : now;
        const newRenewDate = new Date(
          baseDate.getTime() + renewDays * msPerDay,
        );

        const normalizedPlan = params.targetPlanId
          ? normalizePlanSlug(params.targetPlanId)
          : undefined;

        const subRow = await tx.subscription.findUnique({
          where: { id: params.referenceId },
          select: { planAudience: true },
        });
        const audience = subRow?.planAudience ?? 'USER';

        let planDbId: string | undefined;
        if (normalizedPlan) {
          const plan = await tx.plan.findFirst({
            where: { slug: normalizedPlan, audience },
            include: { features: true },
          });
          planDbId = plan?.id;

          if (plan && buildPermissions(plan.features).verifiedBadge === true) {
            await tx.user
              .update({
                where: { id: params.userId },
                data: { verified: true },
              })
              .catch(() => {});
          }

          // Butcher subscription payments no longer affect listing visibility.
        }

        const updateData: Prisma.SubscriptionUpdateInput = {
          renewDate: newRenewDate,
          billingCycle:
            params.billingCycle as Prisma.SubscriptionUpdateInput['billingCycle'],
          autoRenew: true,
          status: 'active',
          listingsUsed: 0,
          liveMinutesUsed: 0,
          featuredAdsUsed: 0,
          pinnedAdsUsed: 0,
          dailyAdsUsed: 0,
          dailyAdsWindowStart: null,
        };
        if (normalizedPlan) {
          updateData.planId = normalizedPlan;
          updateData.planAudience = audience;
          if (planDbId) {
            updateData.plan = { connect: { id: planDbId } };
          }
        }
        await tx.subscription.update({
          where: { id: params.referenceId },
          data: updateData,
        });

        await tx.payment.update({
          where: { id: params.paymentId },
          data: {
            metadata: {
              ...params.storedMeta,
              subscriptionFulfilled: true,
            } as Prisma.InputJsonValue,
          },
        });

        subscriptionResult = {
          targetPlanId: normalizedPlan ?? params.targetPlanId ?? 'sarh-pro',
          newRenewDate,
        };
      }

      if (
        (params.type === 'fee' ||
          params.type === 'listing_fee' ||
          params.type === 'commission') &&
        params.referenceId
      ) {
        const feeRow = await tx.listingFee.findFirst({
          where: {
            OR: [{ id: params.referenceId }, { listingId: params.referenceId }],
          },
          select: { id: true },
        });
        if (feeRow) {
          await tx.listingFee.update({
            where: { id: feeRow.id },
            data: {
              status: 'paid',
              paidAt: new Date(),
              transactionId: params.niTransactionId,
            },
          });
        }
      }

      let butcherOrder:
        | {
            id: string;
            orderNumber: string;
            butcherId: string;
            customerId: string;
            butcherUserId: string;
            nameAr: string;
          }
        | undefined;

      if (params.type === 'butcher_order' && params.referenceId) {
        const order = await tx.butcherOrder.findUnique({
          where: { id: params.referenceId },
          select: {
            id: true,
            orderNumber: true,
            butcherId: true,
            customerId: true,
            paymentStatus: true,
            butcher: { select: { userId: true, nameAr: true } },
          },
        });
        if (!order) {
          throw new Error('Butcher order not found for payment fulfillment');
        }
        if (order.paymentStatus !== 'paid') {
          await tx.butcherOrder.update({
            where: { id: params.referenceId },
            data: {
              paymentStatus: 'paid',
              paidAt: new Date(),
              paymentId: params.paymentId,
            },
          });
        }
        butcherOrder = {
          id: order.id,
          orderNumber: order.orderNumber,
          butcherId: order.butcherId,
          customerId: order.customerId,
          butcherUserId: order.butcher.userId,
          nameAr: order.butcher.nameAr,
        };
      }

      // ── Custom commission payment — no side-effects needed ───────────────
      // Payment is already marked paid above; we just return processed: true.

      // ── Listing boost (featured_ad / pinned_ad) ──────────────────────────
      let boost:
        | { id: string; boostType: string; listingId: string; expiresAt: Date }
        | undefined;
      let promotion:
        { id: string; listingId: string; expiresAt: Date } | undefined;

      if (
        (params.type === 'featured_ad' || params.type === 'pinned_ad') &&
        params.referenceId
      ) {
        const existing = await tx.listingBoost.findUnique({
          where: { id: params.referenceId },
          select: {
            id: true,
            boostType: true,
            listingId: true,
            durationDays: true,
            status: true,
          },
        });

        if (existing && existing.status !== 'paid') {
          const now = new Date();
          const durationHours =
            typeof params.storedMeta.durationHours === 'number' &&
            params.storedMeta.durationHours > 0
              ? params.storedMeta.durationHours
              : existing.durationDays * 24;
          const expires = new Date(
            now.getTime() + durationHours * 60 * 60 * 1000,
          );

          await tx.listingBoost.update({
            where: { id: params.referenceId },
            data: {
              status: 'paid',
              paidAt: now,
              transactionId: params.niTransactionId,
              startsAt: now,
              expiresAt: expires,
            },
          });

          await tx.listing.update({
            where: { id: existing.listingId },
            data:
              existing.boostType === 'featured'
                ? { featured: true, featuredUntil: expires }
                : existing.boostType === 'pinned'
                  ? { pinned: true, pinnedUntil: expires }
                  : {
                      featured: true,
                      featuredUntil: expires,
                      pinned: true,
                      pinnedUntil: expires,
                    },
          });

          boost = {
            id: existing.id,
            boostType: existing.boostType,
            listingId: existing.listingId,
            expiresAt: expires,
          };
        }
      }

      if (params.type === 'promoted_ad' && params.referenceId) {
        const existing = await tx.listingPromotion.findUnique({
          where: { id: params.referenceId },
          select: {
            id: true,
            listingId: true,
            durationDays: true,
            status: true,
            tier: true,
            weight: true,
            baselineViews: true,
          },
        });

        if (existing && existing.status !== 'paid') {
          const now = new Date();
          const durationHours =
            typeof params.storedMeta.durationHours === 'number' &&
            params.storedMeta.durationHours > 0
              ? params.storedMeta.durationHours
              : existing.durationDays * 24;
          const expires = new Date(
            now.getTime() + durationHours * 60 * 60 * 1000,
          );
          const listing = await tx.listing.findUnique({
            where: { id: existing.listingId },
            select: { views: true },
          });

          await tx.listingPromotion.update({
            where: { id: params.referenceId },
            data: {
              status: 'paid',
              paidAt: now,
              transactionId: params.niTransactionId,
              startsAt: now,
              expiresAt: expires,
              baselineViews: listing?.views ?? existing.baselineViews,
            },
          });

          await tx.listing.update({
            where: { id: existing.listingId },
            data: {
              promoted: true,
              promotedUntil: expires,
              promotionWeight: existing.weight,
              promotionTier: existing.tier,
            },
          });

          promotion = {
            id: existing.id,
            listingId: existing.listingId,
            expiresAt: expires,
          };
        }
      }

      return {
        processed: true,
        subscription: subscriptionResult,
        butcherOrder,
        boost,
        promotion,
      };
    });
  }

  /**
   * NI confirmed a butcher_checkout payment. Allow pending|failed → paid in
   * one transaction, then create a Final Order only from a still-held reservation.
   * Never re-reserves stock after release; stamps needsReconciliation instead.
   */
  private async fulfillButcherCheckoutAfterNiSuccess(
    tx: Prisma.TransactionClient,
    params: {
      paymentId: string;
      niTransactionId: string;
      type: string | undefined;
      referenceId: string;
      userId: string;
      storedMeta: Record<string, unknown>;
    },
  ): Promise<{
    processed: boolean;
    capturedAfterCancel?: boolean;
    butcherOrder?: {
      id: string;
      orderNumber: string;
      butcherId: string;
      customerId: string;
      butcherUserId: string;
      nameAr: string;
    };
  }> {
    const existingOrder = await this.findFulfilledButcherOrder(tx, {
      paymentId: params.paymentId,
      type: params.type,
      referenceId: params.referenceId,
    });
    if (existingOrder) {
      return { processed: false, butcherOrder: existingOrder };
    }

    const current = await tx.payment.findUnique({
      where: { id: params.paymentId },
      select: { status: true, metadata: true },
    });
    if (current?.status === 'refunded') {
      return { processed: false };
    }

    const updated = await tx.payment.updateMany({
      where: {
        id: params.paymentId,
        status: { in: ['pending', 'failed'] },
      },
      data: {
        status: 'paid',
        transactionId: params.niTransactionId,
        paidAt: new Date(),
      },
    });
    if (updated.count === 0 && current?.status !== 'paid') {
      return { processed: false };
    }

    const fulfilled = await fulfillPaidCheckout(tx, {
      checkoutId: params.referenceId,
      paymentId: params.paymentId,
      userId: params.userId,
    });
    if (fulfilled.butcherOrder) {
      return {
        processed: Boolean(fulfilled.created),
        butcherOrder: fulfilled.butcherOrder,
      };
    }

    const latest = await tx.payment.findUnique({
      where: { id: params.paymentId },
      select: { metadata: true },
    });
    const prevMeta = (latest?.metadata ?? current?.metadata ?? {}) as Record<
      string,
      unknown
    >;
    await tx.payment.update({
      where: { id: params.paymentId },
      data: {
        metadata: {
          ...prevMeta,
          ...params.storedMeta,
          capturedAfterCancel: true,
          needsReconciliation: true,
          capturedAfterCancelAt:
            typeof prevMeta.capturedAfterCancelAt === 'string'
              ? prevMeta.capturedAfterCancelAt
              : new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    return { processed: false, capturedAfterCancel: true };
  }

  /**
   * Idempotent refund: Payment → refunded, and butcher order paymentStatus → refunded.
   * Does not change ButcherOrder.status (cancelled/delivered stays as-is).
   */
  markPaymentRefunded(paymentId: string, metadata: Record<string, unknown>) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: {
          id: true,
          status: true,
          metadata: true,
          referenceType: true,
          referenceId: true,
        },
      });
      if (!payment) return null;

      let newlyRefunded = false;
      if (payment.status !== 'refunded') {
        const updated = await tx.payment.updateMany({
          where: {
            id: paymentId,
            status: { in: ['paid', 'pending', 'failed'] },
          },
          data: {
            status: 'refunded',
            metadata: {
              ...((payment.metadata ?? {}) as Record<string, unknown>),
              ...metadata,
            } as Prisma.InputJsonValue,
          },
        });
        newlyRefunded = updated.count > 0;
      }

      if (payment.referenceType === 'butcher_order' && payment.referenceId) {
        await tx.butcherOrder.updateMany({
          where: {
            id: payment.referenceId,
            paymentStatus: { not: 'refunded' },
          },
          data: { paymentStatus: 'refunded' },
        });
      }

      if (payment.referenceType === 'butcher_checkout' && payment.referenceId) {
        await tx.butcherOrder.updateMany({
          where: {
            checkoutId: payment.referenceId,
            paymentStatus: { not: 'refunded' },
          },
          data: { paymentStatus: 'refunded' },
        });
      }

      return { id: paymentId, status: 'refunded' as const, newlyRefunded };
    });
  }

  /**
   * Reverse butcher order commission ledger (referenceType=commission)
   * when the underlying butcher_order payment is refunded. Idempotent.
   */
  async markOrderCommissionRefunded(
    butcherOrderId: string,
    extraMetadata: Record<string, unknown>,
  ) {
    const existing = await this.prisma.payment.findFirst({
      where: {
        referenceType: { in: ['order_commission', 'commission'] },
        referenceId: butcherOrderId,
        status: 'paid',
      },
      select: { id: true, metadata: true },
    });
    if (!existing) return null;

    const prevMeta = (existing.metadata ?? {}) as Record<string, unknown>;
    return this.prisma.payment.update({
      where: { id: existing.id },
      data: {
        status: 'refunded',
        metadata: {
          ...prevMeta,
          ...extraMetadata,
          commissionReversed: true,
        } as Prisma.InputJsonValue,
      },
    });
  }

  markPaymentFailedById(paymentId: string) {
    return this.prisma.$transaction(async (tx) => {
      const failed = await tx.payment.updateMany({
        where: { id: paymentId, status: 'pending' },
        data: { status: 'failed' },
      });
      if (!failed.count) return failed;

      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { referenceType: true, referenceId: true },
      });
      if (
        payment?.referenceType === 'butcher_checkout' &&
        payment.referenceId
      ) {
        await releaseCheckoutReservations(tx, payment.referenceId, 'failed');
      }
      return failed;
    });
  }

  markButcherOrderPaymentFailed(orderId: string) {
    return this.prisma.butcherOrder.updateMany({
      where: { id: orderId, paymentStatus: 'unpaid' },
      data: { paymentStatus: 'failed' },
    });
  }

  findPaymentOwnedByUser(paymentId: string, userId: string) {
    return this.prisma.payment.findFirst({
      where: { id: paymentId, userId },
    });
  }

  findPaymentByIdFull(paymentId: string) {
    return this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
  }

  findOrderIdByCheckoutId(checkoutId: string) {
    return this.prisma.butcherOrder
      .findUnique({
        where: { checkoutId },
        select: { id: true },
      })
      .then((row) => row?.id ?? null);
  }

  findButcherOrderByPaymentId(paymentId: string) {
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

  /**
   * Returns pending payments that:
   *  - were created more than `olderThanMinutes` ago
   *  - already have a transactionId / orderId (i.e. NI knows about them)
   * These are candidates for status polling.
   */
  findStalePendingPayments(olderThanMinutes = 10) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    return this.prisma.payment.findMany({
      where: {
        status: 'pending',
        createdAt: { lt: cutoff },
      },
      select: {
        id: true,
        orderId: true,
        transactionId: true,
        userId: true,
        referenceType: true,
        referenceId: true,
        amount: true,
        currency: true,
        metadata: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
  }
}
