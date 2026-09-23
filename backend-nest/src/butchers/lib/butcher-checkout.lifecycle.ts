import { Prisma } from '@prisma/client';
import { throwApi } from '../../common/exceptions/api.exception';
import { nextButcherOrderNumber } from './order-number.util';
import type { ValidatedOrderLine } from './order-line.util';

export const DEFAULT_CHECKOUT_TTL_MINUTES = 30;

export type CheckoutItemSnapshot = {
  productId: string;
  cutType: string;
  weightKg: number;
  linePrice: number;
  reservedQuantity: number;
};

export type PaidCheckoutOrder = {
  id: string;
  orderNumber: string;
  butcherId: string;
  customerId: string;
  butcherUserId: string;
  nameAr: string;
};

type LockedCheckoutRow = {
  id: string;
  userId: string;
  butcherId: string;
  paymentId: string | null;
  status: string;
  expiresAt: Date;
  deliveryType: string;
  deliveryAddress: string | null;
  notes: string | null;
  currency: string;
  totalPrice: number;
};

function asSnapshot(items: ValidatedOrderLine[]): CheckoutItemSnapshot[] {
  return items.map((item) => ({
    productId: item.productId,
    cutType: item.cutType,
    weightKg: item.weightKg,
    linePrice: item.linePrice,
    reservedQuantity: item.reservedQuantity,
  }));
}

export function checkoutItemsEqual(
  left: unknown,
  right: CheckoutItemSnapshot[],
): boolean {
  if (!Array.isArray(left) || left.length !== right.length) return false;
  return left.every((raw, index) => {
    const item = raw as Partial<CheckoutItemSnapshot>;
    const expected = right[index];
    return (
      item.productId === expected.productId &&
      item.cutType === expected.cutType &&
      Number(item.weightKg) === expected.weightKg &&
      Number(item.linePrice) === expected.linePrice &&
      Number(item.reservedQuantity) === expected.reservedQuantity
    );
  });
}

export async function reserveProductQuantity(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: number,
): Promise<boolean> {
  if (quantity <= 0) return true;
  const affected = await tx.$executeRaw`
    UPDATE "ButcherProduct"
    SET "reservedQuantity" = "reservedQuantity" + ${quantity}
    WHERE "id" = ${productId}
      AND "inStock" = true
      AND ("availableQuantity" - "reservedQuantity") >= ${quantity}
  `;
  return affected > 0;
}

export async function releaseProductQuantity(
  tx: Prisma.TransactionClient,
  productId: string,
  quantity: number,
): Promise<void> {
  if (quantity <= 0) return;
  await tx.$executeRaw`
    UPDATE "ButcherProduct"
    SET "reservedQuantity" = GREATEST("reservedQuantity" - ${quantity}, 0)
    WHERE "id" = ${productId}
  `;
}

export async function lockCheckoutRow(
  tx: Prisma.TransactionClient,
  checkoutId: string,
): Promise<LockedCheckoutRow | null> {
  const rows = await tx.$queryRaw<LockedCheckoutRow[]>`
    SELECT
      c.id,
      c."userId" AS "userId",
      c."butcherId" AS "butcherId",
      c."paymentId" AS "paymentId",
      c.status,
      c."expiresAt" AS "expiresAt",
      c."deliveryType" AS "deliveryType",
      c."deliveryAddress" AS "deliveryAddress",
      c.notes,
      c.currency,
      c."totalPrice" AS "totalPrice"
    FROM "ButcherCheckout" c
    WHERE c.id = ${checkoutId}
    FOR UPDATE OF c
  `;
  return rows[0] ?? null;
}

export async function releaseCheckoutReservations(
  tx: Prisma.TransactionClient,
  checkoutId: string,
  nextStatus: 'failed' | 'cancelled' | 'expired',
): Promise<{ released: boolean; quantities: number }> {
  const locked = await lockCheckoutRow(tx, checkoutId);
  if (!locked) return { released: false, quantities: 0 };
  if (locked.status !== 'pending') return { released: false, quantities: 0 };

  const held = await tx.butcherCheckoutReservation.findMany({
    take: 200,
    where: { checkoutId, status: 'held' },
    select: { id: true, productId: true, quantity: true },
  });

  for (const row of held) {
    await releaseProductQuantity(tx, row.productId, row.quantity);
  }

  if (held.length > 0) {
    await tx.butcherCheckoutReservation.updateMany({
      where: { id: { in: held.map((row) => row.id) }, status: 'held' },
      data: { status: 'released', releasedAt: new Date() },
    });
  }

  await tx.butcherCheckout.update({
    where: { id: checkoutId },
    data: { status: nextStatus },
  });

  return {
    released: true,
    quantities: held.reduce((sum, row) => sum + row.quantity, 0),
  };
}

export async function createCheckoutWithReservations(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    butcherId: string;
    deliveryType: string;
    deliveryAddress?: string | null;
    notes?: string | null;
    currency: string;
    totalPrice: number;
    items: ValidatedOrderLine[];
    expiresAt: Date;
  },
) {
  if (!input.items.length) {
    throwApi(
      400,
      'validation_error',
      'يجب أن يحتوي الطلب على منتج واحد على الأقل',
    );
  }

  for (const item of input.items) {
    const ok = await reserveProductQuantity(
      tx,
      item.productId,
      item.reservedQuantity,
    );
    if (!ok) {
      throwApi(409, 'insufficient_inventory', 'الكمية غير متوفرة حالياً');
    }
  }

  const checkout = await tx.butcherCheckout.create({
    data: {
      userId: input.userId,
      butcherId: input.butcherId,
      status: 'pending',
      expiresAt: input.expiresAt,
      deliveryType: input.deliveryType,
      deliveryAddress: input.deliveryAddress,
      notes: input.notes,
      currency: input.currency,
      totalPrice: input.totalPrice,
      itemsSnapshot: asSnapshot(input.items) as Prisma.InputJsonValue,
      reservations: {
        create: input.items.map((item) => ({
          userId: input.userId,
          productId: item.productId,
          quantity: item.reservedQuantity,
          status: 'held' as const,
          expiresAt: input.expiresAt,
        })),
      },
    },
  });

  return checkout;
}

async function loadPaidOrderShape(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<PaidCheckoutOrder | null> {
  const order = await tx.butcherOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      butcherId: true,
      customerId: true,
      butcher: { select: { userId: true, nameAr: true } },
    },
  });
  if (!order) return null;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    butcherId: order.butcherId,
    customerId: order.customerId,
    butcherUserId: order.butcher.userId,
    nameAr: order.butcher.nameAr,
  };
}

export async function fulfillPaidCheckout(
  tx: Prisma.TransactionClient,
  params: {
    checkoutId: string;
    paymentId: string;
    userId: string;
  },
): Promise<{
  butcherOrder?: PaidCheckoutOrder;
  capturedAfterCancel?: boolean;
  created: boolean;
}> {
  const locked = await lockCheckoutRow(tx, params.checkoutId);
  if (!locked) {
    throw new Error('Butcher checkout not found for payment fulfillment');
  }

  if (locked.userId !== params.userId) {
    throw new Error('Butcher checkout does not belong to paying user');
  }

  const existingByPayment = await tx.butcherOrder.findUnique({
    where: { paymentId: params.paymentId },
    select: { id: true },
  });
  if (existingByPayment) {
    const butcherOrder = await loadPaidOrderShape(tx, existingByPayment.id);
    return { butcherOrder: butcherOrder ?? undefined, created: false };
  }

  const existingByCheckout = await tx.butcherOrder.findUnique({
    where: { checkoutId: locked.id },
    select: { id: true },
  });
  if (existingByCheckout) {
    const butcherOrder = await loadPaidOrderShape(tx, existingByCheckout.id);
    return { butcherOrder: butcherOrder ?? undefined, created: false };
  }

  if (locked.status !== 'pending') {
    return { capturedAfterCancel: true, created: false };
  }

  const reservations = await tx.butcherCheckoutReservation.findMany({
    take: 200,
    where: { checkoutId: locked.id, status: 'held', userId: params.userId },
    select: { id: true, productId: true, quantity: true },
  });
  if (!reservations.length) {
    return { capturedAfterCancel: true, created: false };
  }

  const checkout = await tx.butcherCheckout.findUnique({
    where: { id: locked.id },
    select: { itemsSnapshot: true },
  });
  const snapshot = Array.isArray(checkout?.itemsSnapshot)
    ? (checkout.itemsSnapshot as CheckoutItemSnapshot[])
    : [];
  if (!snapshot.length) {
    throw new Error('Butcher checkout snapshot missing for fulfillment');
  }

  const firstItem = snapshot[0];
  const orderNumber = await nextButcherOrderNumber(tx);
  const now = new Date();

  try {
    const order = await tx.butcherOrder.create({
      data: {
        butcherId: locked.butcherId,
        customerId: locked.userId,
        productId: firstItem.productId,
        cutType: firstItem.cutType,
        weightKg: firstItem.weightKg,
        reservedQuantity: firstItem.reservedQuantity,
        deliveryType: locked.deliveryType,
        deliveryAddress: locked.deliveryAddress,
        notes: locked.notes,
        currency: locked.currency,
        totalPrice: locked.totalPrice,
        orderNumber,
        status: 'pending',
        paymentStatus: 'paid',
        paidAt: now,
        checkoutId: locked.id,
        paymentId: params.paymentId,
        items: {
          create: snapshot.map((item) => ({
            productId: item.productId,
            cutType: item.cutType,
            weightKg: item.weightKg,
            linePrice: item.linePrice,
            reservedQuantity: item.reservedQuantity,
          })),
        },
      },
      include: {
        butcher: { select: { userId: true, nameAr: true } },
      },
    });

    await tx.butcherCheckoutReservation.updateMany({
      where: { checkoutId: locked.id, status: 'held', userId: params.userId },
      data: { status: 'converted' },
    });

    await tx.butcherCheckout.update({
      where: { id: locked.id },
      data: {
        status: 'paid',
        paymentId: params.paymentId,
      },
    });

    await tx.orderTimeline.create({
      data: {
        orderId: order.id,
        status: 'pending',
        note: 'Order Created — payment confirmed',
        createdBy: locked.userId,
      },
    });

    return {
      created: true,
      butcherOrder: {
        id: order.id,
        orderNumber: order.orderNumber,
        butcherId: order.butcherId,
        customerId: order.customerId,
        butcherUserId: order.butcher.userId,
        nameAr: order.butcher.nameAr,
      },
    };
  } catch (err) {
    const prismaErr = err as { code?: string };
    if (prismaErr.code === 'P2002') {
      const raced =
        (await tx.butcherOrder.findUnique({
          where: { paymentId: params.paymentId },
          select: { id: true },
        })) ??
        (await tx.butcherOrder.findUnique({
          where: { checkoutId: locked.id },
          select: { id: true },
        }));
      if (raced) {
        const butcherOrder = await loadPaidOrderShape(tx, raced.id);
        return { butcherOrder: butcherOrder ?? undefined, created: false };
      }
    }
    throw err;
  }
}
