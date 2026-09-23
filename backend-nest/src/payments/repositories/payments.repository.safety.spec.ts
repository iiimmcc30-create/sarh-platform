import { PaymentsRepository } from './payments.repository';

describe('PaymentsRepository payment-safety transitions', () => {
  const tx = {
    payment: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    butcherOrder: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const prisma = {
    payment: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };

  const repo = new PaymentsRepository(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn) => fn(tx));
  });

  it('markPaymentFailedById only updates pending rows (paid stays paid)', async () => {
    tx.payment.updateMany.mockResolvedValue({ count: 0 });

    const result = await repo.markPaymentFailedById('pay-paid');

    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay-paid', status: 'pending' },
      data: { status: 'failed' },
    });
    expect(result).toEqual({ count: 0 });
  });

  it('markPaymentFailedById updates a pending payment', async () => {
    tx.payment.updateMany.mockResolvedValue({ count: 1 });
    tx.payment.findUnique.mockResolvedValue({
      referenceType: 'listing_fee',
      referenceId: 'fee-1',
    });

    const result = await repo.markPaymentFailedById('pay-pending');

    expect(result).toEqual({ count: 1 });
  });

  it('records NI capture on a cancelled butcher order without fulfilling it', async () => {
    tx.butcherOrder.findUnique.mockResolvedValue({
      id: 'ord-1',
      status: 'cancelled',
    });
    tx.payment.findUnique.mockResolvedValue({
      status: 'failed',
      metadata: { type: 'butcher_order' },
    });
    tx.payment.updateMany.mockResolvedValue({ count: 1 });

    const result = await repo.processSuccessfulPayment({
      paymentId: 'pay-late',
      niTransactionId: 'ni-cap',
      type: 'butcher_order',
      referenceId: 'ord-1',
      userId: 'u1',
      targetPlanId: undefined,
      billingCycle: 'monthly',
      storedMeta: { type: 'butcher_order' },
    });

    expect(result).toEqual({
      processed: false,
      capturedAfterCancel: true,
    });
    expect(tx.butcherOrder.update).not.toHaveBeenCalled();
    expect(tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'pay-late',
          status: { in: ['pending', 'failed'] },
        },
        data: expect.objectContaining({
          status: 'paid',
          transactionId: 'ni-cap',
          metadata: expect.objectContaining({
            capturedAfterCancel: true,
            needsReconciliation: true,
          }),
        }),
      }),
    );
  });

  it('sets ButcherOrder.paymentStatus to refunded with the payment (idempotent)', async () => {
    tx.payment.findUnique.mockResolvedValue({
      id: 'pay-1',
      status: 'paid',
      metadata: {},
      referenceType: 'butcher_order',
      referenceId: 'ord-1',
    });
    tx.payment.updateMany.mockResolvedValue({ count: 1 });
    tx.butcherOrder.updateMany.mockResolvedValue({ count: 1 });

    const first = await repo.markPaymentRefunded('pay-1', {
      refundedAt: 'now',
    });
    expect(first).toEqual({
      id: 'pay-1',
      status: 'refunded',
      newlyRefunded: true,
    });
    expect(tx.butcherOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'ord-1', paymentStatus: { not: 'refunded' } },
      data: { paymentStatus: 'refunded' },
    });

    tx.payment.findUnique.mockResolvedValue({
      id: 'pay-1',
      status: 'refunded',
      metadata: {},
      referenceType: 'butcher_order',
      referenceId: 'ord-1',
    });
    tx.payment.updateMany.mockClear();
    tx.butcherOrder.updateMany.mockResolvedValue({ count: 0 });

    const second = await repo.markPaymentRefunded('pay-1', {
      refundedAt: 'now',
    });
    expect(second).toEqual({
      id: 'pay-1',
      status: 'refunded',
      newlyRefunded: false,
    });
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
    expect(tx.butcherOrder.updateMany).toHaveBeenCalled();
  });

  it('markOrderCommissionRefunded is a no-op when already reversed', async () => {
    prisma.payment.findFirst.mockResolvedValue(null);

    const result = await repo.markOrderCommissionRefunded('ord-1', {
      refundedAt: 'now',
    });

    expect(result).toBeNull();
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('duplicate confirmed butcher_checkout payment returns the existing Final Order once', async () => {
    tx.payment.updateMany.mockResolvedValue({ count: 0 });
    tx.butcherOrder.findFirst.mockResolvedValue({
      id: 'ord-final',
      orderNumber: 'ORD-2026-000010',
      butcherId: 'b1',
      customerId: 'u1',
      butcher: { userId: 'butcher-user', nameAr: 'ملحمة' },
    });

    const first = await repo.processSuccessfulPayment({
      paymentId: 'pay-chk',
      niTransactionId: 'ni-1',
      type: 'butcher_checkout',
      referenceId: 'chk-1',
      userId: 'u1',
      targetPlanId: undefined,
      billingCycle: 'monthly',
      storedMeta: { type: 'butcher_checkout' },
    });
    const second = await repo.processSuccessfulPayment({
      paymentId: 'pay-chk',
      niTransactionId: 'ni-1',
      type: 'butcher_checkout',
      referenceId: 'chk-1',
      userId: 'u1',
      targetPlanId: undefined,
      billingCycle: 'monthly',
      storedMeta: { type: 'butcher_checkout' },
    });

    expect(first).toEqual({
      processed: false,
      butcherOrder: {
        id: 'ord-final',
        orderNumber: 'ORD-2026-000010',
        butcherId: 'b1',
        customerId: 'u1',
        butcherUserId: 'butcher-user',
        nameAr: 'ملحمة',
      },
    });
    expect(second.butcherOrder?.id).toBe('ord-final');
    expect(tx.butcherOrder.update).not.toHaveBeenCalled();
  });

  it('does not promote a failed listing_fee payment to paid', async () => {
    tx.payment.updateMany.mockResolvedValue({ count: 0 });
    tx.butcherOrder.findFirst.mockResolvedValue(null);

    const result = await repo.processSuccessfulPayment({
      paymentId: 'pay-fee',
      niTransactionId: 'ni-fee',
      type: 'listing_fee',
      referenceId: 'fee-1',
      userId: 'u1',
      targetPlanId: undefined,
      billingCycle: 'monthly',
      storedMeta: { type: 'listing_fee' },
    });

    expect(tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pay-fee', status: 'pending' },
      }),
    );
    expect(result).toEqual({ processed: false, butcherOrder: undefined });
  });
});

type ProductRow = {
  id: string;
  inStock: boolean;
  availableQuantity: number;
  reservedQuantity: number;
};

type CheckoutRow = {
  id: string;
  userId: string;
  butcherId: string;
  paymentId: string | null;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired';
  expiresAt: Date;
  deliveryType: string;
  deliveryAddress: string | null;
  notes: string | null;
  currency: string;
  totalPrice: number;
  itemsSnapshot: unknown;
};

type ReservationRow = {
  id: string;
  checkoutId: string;
  userId: string;
  productId: string;
  quantity: number;
  status: 'held' | 'converted' | 'released';
};

type OrderRow = {
  id: string;
  orderNumber: string;
  butcherId: string;
  customerId: string;
  paymentId: string | null;
  checkoutId: string | null;
  paymentStatus: string;
  status: string;
};

type PaymentRow = {
  id: string;
  status: 'pending' | 'failed' | 'paid' | 'refunded';
  metadata: Record<string, unknown>;
  transactionId: string | null;
  paidAt: Date | null;
};

function createCheckoutCaptureStore(seed: {
  payment: PaymentRow;
  checkout: CheckoutRow;
  reservation: ReservationRow;
  product?: ProductRow;
}) {
  const products = new Map<string, ProductRow>([
    [
      seed.reservation.productId,
      seed.product ?? {
        id: seed.reservation.productId,
        inStock: true,
        availableQuantity: 10,
        reservedQuantity:
          seed.reservation.status === 'held' ? seed.reservation.quantity : 0,
      },
    ],
  ]);
  const payments = new Map<string, PaymentRow>([
    [seed.payment.id, { ...seed.payment }],
  ]);
  const checkouts = new Map<string, CheckoutRow>([
    [seed.checkout.id, { ...seed.checkout }],
  ]);
  const reservations: ReservationRow[] = [{ ...seed.reservation }];
  const orders = new Map<string, OrderRow>();
  let orderSeq = 0;

  function tx() {
    return {
      $executeRaw: async (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ) => {
        const sql = strings.join(' ');
        if (sql.includes('"reservedQuantity" = "reservedQuantity" +')) {
          const quantity = Number(values[0]);
          const productId = String(values[1]);
          const product = products.get(productId);
          if (
            !product ||
            !product.inStock ||
            product.availableQuantity - product.reservedQuantity < quantity
          ) {
            return 0;
          }
          product.reservedQuantity += quantity;
          return 1;
        }
        if (sql.includes('GREATEST("reservedQuantity" -')) {
          const quantity = Number(values[0]);
          const productId = String(values[1]);
          const product = products.get(productId);
          if (product) {
            product.reservedQuantity = Math.max(
              product.reservedQuantity - quantity,
              0,
            );
          }
          return 1;
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
      $queryRaw: async (
        _strings: TemplateStringsArray,
        ...values: unknown[]
      ) => {
        const checkout = checkouts.get(String(values[0]));
        return checkout ? [checkout] : [];
      },
      payment: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          payments.get(where.id) ?? null,
        updateMany: async ({
          where,
          data,
        }: {
          where: { id: string; status: string | { in: string[] } };
          data: Partial<PaymentRow>;
        }) => {
          const row = payments.get(where.id);
          if (!row) return { count: 0 };
          const allowed = Array.isArray((where.status as { in?: string[] })?.in)
            ? (where.status as { in: string[] }).in
            : [where.status as string];
          if (!allowed.includes(row.status)) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<PaymentRow>;
        }) => {
          const row = payments.get(where.id);
          if (!row) throw new Error('missing payment');
          Object.assign(row, data);
          return row;
        },
      },
      butcherCheckout: {
        findUnique: async ({
          where,
          select,
        }: {
          where: { id?: string; paymentId?: string };
          select?: Record<string, boolean>;
        }) => {
          const row = where.id
            ? checkouts.get(where.id)
            : [...checkouts.values()].find(
                (c) => c.paymentId === where.paymentId,
              );
          if (!row) return null;
          if (select?.itemsSnapshot)
            return { itemsSnapshot: row.itemsSnapshot };
          return row;
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<CheckoutRow>;
        }) => {
          const row = checkouts.get(where.id);
          if (!row) throw new Error('missing checkout');
          Object.assign(row, data);
          return row;
        },
      },
      butcherCheckoutReservation: {
        findMany: async ({
          where,
        }: {
          where: { checkoutId: string; status?: string; userId?: string };
        }) =>
          reservations.filter(
            (row) =>
              row.checkoutId === where.checkoutId &&
              (!where.status || row.status === where.status) &&
              (!where.userId || row.userId === where.userId),
          ),
        updateMany: async ({
          where,
          data,
        }: {
          where: { checkoutId: string; status?: string; userId?: string };
          data: Partial<ReservationRow>;
        }) => {
          let count = 0;
          for (const row of reservations) {
            if (row.checkoutId !== where.checkoutId) continue;
            if (where.status && row.status !== where.status) continue;
            if (where.userId && row.userId !== where.userId) continue;
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      },
      butcherOrder: {
        findUnique: async ({
          where,
        }: {
          where: { paymentId?: string; checkoutId?: string; id?: string };
        }) => {
          const row = [...orders.values()].find((order) => {
            if (where.id) return order.id === where.id;
            if (where.paymentId) return order.paymentId === where.paymentId;
            if (where.checkoutId) return order.checkoutId === where.checkoutId;
            return false;
          });
          if (!row) return null;
          return {
            ...row,
            butcher: { userId: 'butcher-user', nameAr: 'ملحمة' },
          };
        },
        findFirst: async ({
          where,
        }: {
          where: {
            OR?: Array<{ paymentId?: string; checkoutId?: string }>;
            paymentId?: string;
            checkoutId?: string;
          };
        }) => {
          const row = [...orders.values()].find((order) => {
            if (where.OR) {
              return where.OR.some(
                (clause) =>
                  (clause.paymentId && order.paymentId === clause.paymentId) ||
                  (clause.checkoutId && order.checkoutId === clause.checkoutId),
              );
            }
            if (where.paymentId) return order.paymentId === where.paymentId;
            if (where.checkoutId) return order.checkoutId === where.checkoutId;
            return false;
          });
          if (!row) return null;
          return {
            ...row,
            butcher: { userId: 'butcher-user', nameAr: 'ملحمة' },
          };
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          if (
            [...orders.values()].some(
              (order) =>
                (data.paymentId && order.paymentId === data.paymentId) ||
                (data.checkoutId && order.checkoutId === data.checkoutId),
            )
          ) {
            const err = new Error('Unique constraint') as Error & {
              code?: string;
            };
            err.code = 'P2002';
            throw err;
          }
          const id = `ord-${++orderSeq}`;
          const row: OrderRow = {
            id,
            orderNumber: String(data.orderNumber),
            butcherId: String(data.butcherId),
            customerId: String(data.customerId),
            paymentId: (data.paymentId as string | null) ?? null,
            checkoutId: (data.checkoutId as string | null) ?? null,
            paymentStatus: String(data.paymentStatus),
            status: String(data.status),
          };
          orders.set(id, row);
          return {
            ...row,
            butcher: { userId: 'butcher-user', nameAr: 'ملحمة' },
          };
        },
      },
      orderTimeline: {
        create: async (args: { data: unknown }) => args.data,
      },
      orderNumberSequence: {
        upsert: async () => ({ year: 2026, lastNumber: orderSeq }),
        update: async () => ({ lastNumber: orderSeq + 1 }),
      },
    };
  }

  return {
    products,
    payments,
    checkouts,
    reservations,
    orders,
    prisma: {
      $transaction: async (fn: (client: ReturnType<typeof tx>) => unknown) =>
        fn(tx()),
    },
  };
}

const captureInput = {
  paymentId: 'pay-late',
  niTransactionId: 'ni-cap',
  type: 'butcher_checkout' as const,
  referenceId: 'chk-1',
  userId: 'user-1',
  targetPlanId: undefined,
  billingCycle: 'monthly',
  storedMeta: { type: 'butcher_checkout' },
};

describe('butcher_checkout NI success after local failed payment', () => {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const checkoutBase: CheckoutRow = {
    id: 'chk-1',
    userId: 'user-1',
    butcherId: 'butcher-1',
    paymentId: 'pay-late',
    status: 'pending',
    expiresAt,
    deliveryType: 'pickup',
    deliveryAddress: null,
    notes: null,
    currency: 'SAR',
    totalPrice: 80,
    itemsSnapshot: [
      {
        productId: 'prod-1',
        cutType: 'whole',
        weightKg: 2,
        linePrice: 80,
        reservedQuantity: 2,
      },
    ],
  };

  it('failed payment + released reservation → paid + needsReconciliation and 0 Final Orders', async () => {
    const store = createCheckoutCaptureStore({
      payment: {
        id: 'pay-late',
        status: 'failed',
        metadata: { type: 'butcher_checkout' },
        transactionId: 'ni-cap',
        paidAt: null,
      },
      checkout: { ...checkoutBase, status: 'expired' },
      reservation: {
        id: 'res-1',
        checkoutId: 'chk-1',
        userId: 'user-1',
        productId: 'prod-1',
        quantity: 2,
        status: 'released',
      },
      product: {
        id: 'prod-1',
        inStock: true,
        availableQuantity: 10,
        reservedQuantity: 0,
      },
    });
    const repo = new PaymentsRepository(store.prisma as never);

    const result = await repo.processSuccessfulPayment(captureInput);

    const payment = store.payments.get('pay-late');
    expect(result.capturedAfterCancel).toBe(true);
    expect(result.butcherOrder).toBeUndefined();
    expect(store.orders.size).toBe(0);
    expect(payment?.status).toBe('paid');
    expect(payment?.metadata).toEqual(
      expect.objectContaining({
        capturedAfterCancel: true,
        needsReconciliation: true,
      }),
    );
    expect(typeof payment?.metadata.capturedAfterCancelAt).toBe('string');
    expect(store.products.get('prod-1')?.reservedQuantity).toBe(0);
  });

  it('failed payment + held reservation → exactly one paid Final Order', async () => {
    const store = createCheckoutCaptureStore({
      payment: {
        id: 'pay-late',
        status: 'failed',
        metadata: { type: 'butcher_checkout' },
        transactionId: 'ni-cap',
        paidAt: null,
      },
      checkout: { ...checkoutBase },
      reservation: {
        id: 'res-1',
        checkoutId: 'chk-1',
        userId: 'user-1',
        productId: 'prod-1',
        quantity: 2,
        status: 'held',
      },
    });
    const repo = new PaymentsRepository(store.prisma as never);

    const result = await repo.processSuccessfulPayment(captureInput);

    expect(result.processed).toBe(true);
    expect(result.capturedAfterCancel).toBeUndefined();
    expect(store.orders.size).toBe(1);
    const order = [...store.orders.values()][0];
    expect(order.paymentStatus).toBe('paid');
    expect(order.paymentId).toBe('pay-late');
    expect(result.butcherOrder?.id).toBe(order.id);
    expect(store.payments.get('pay-late')?.status).toBe('paid');
    expect(
      store.payments.get('pay-late')?.metadata.needsReconciliation,
    ).not.toBe(true);
    expect(store.reservations[0]?.status).toBe('converted');
    expect(store.products.get('prod-1')?.reservedQuantity).toBe(2);
  });

  it('duplicate NI success after fulfill still returns the same single Final Order', async () => {
    const store = createCheckoutCaptureStore({
      payment: {
        id: 'pay-late',
        status: 'failed',
        metadata: { type: 'butcher_checkout' },
        transactionId: 'ni-cap',
        paidAt: null,
      },
      checkout: { ...checkoutBase },
      reservation: {
        id: 'res-1',
        checkoutId: 'chk-1',
        userId: 'user-1',
        productId: 'prod-1',
        quantity: 2,
        status: 'held',
      },
    });
    const repo = new PaymentsRepository(store.prisma as never);

    const first = await repo.processSuccessfulPayment(captureInput);
    const second = await repo.processSuccessfulPayment(captureInput);

    expect(store.orders.size).toBe(1);
    expect(first.processed).toBe(true);
    expect(second.processed).toBe(false);
    expect(second.butcherOrder?.id).toBe(first.butcherOrder?.id);
  });

  it('does not create a Final Order when no held reservation exists', async () => {
    const store = createCheckoutCaptureStore({
      payment: {
        id: 'pay-late',
        status: 'pending',
        metadata: { type: 'butcher_checkout' },
        transactionId: 'ni-cap',
        paidAt: null,
      },
      checkout: { ...checkoutBase, status: 'cancelled' },
      reservation: {
        id: 'res-1',
        checkoutId: 'chk-1',
        userId: 'user-1',
        productId: 'prod-1',
        quantity: 2,
        status: 'released',
      },
    });
    const repo = new PaymentsRepository(store.prisma as never);

    const result = await repo.processSuccessfulPayment(captureInput);

    expect(result.capturedAfterCancel).toBe(true);
    expect(store.orders.size).toBe(0);
    expect(store.reservations[0]?.status).toBe('released');
  });
});
