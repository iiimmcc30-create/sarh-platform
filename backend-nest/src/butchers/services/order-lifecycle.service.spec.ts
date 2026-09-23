import { Test } from '@nestjs/testing';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrderStateMachineService } from './order-state-machine.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppNotificationsService } from '../../queue/services/app-notifications.service';
import { SocketEmitService } from '../../gateway/services/socket-emit.service';
import { ButcherRankingService } from './butcher-ranking.service';
import { SubscriptionEntitlementService } from '../../subscriptions/services/subscription-entitlement.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { butcherOrderCommissionPaymentRef } from '../../lib/commissions';

describe('OrderLifecycleService', () => {
  let service: OrderLifecycleService;
  const prisma: {
    $transaction: jest.Mock;
    user: { findMany: jest.Mock };
    $queryRaw?: jest.Mock;
  } = {
    $transaction: jest.fn(),
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'admin-1' }]) },
  };
  const notifications = {
    notifyUser: jest.fn().mockResolvedValue(undefined),
    notifyUsers: jest.fn().mockResolvedValue(undefined),
  };
  const sockets = {
    emitToUser: jest.fn(),
    getServer: jest.fn().mockReturnValue({ emit: jest.fn() }),
  };
  const ranking = {
    onOrderCancelled: jest.fn().mockResolvedValue(undefined),
    onOrderDelivered: jest.fn().mockResolvedValue(undefined),
  };
  const entitlements = {
    getPermissionsForUser: jest.fn().mockResolvedValue({ storeCommission: 1 }),
  };

  const lockedRow: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    productId: string;
    customerId: string;
    reservedQuantity: number;
    butcherId: string;
    butcherUserId: string;
    totalPrice: number;
    currency: string;
  } = {
    id: 'order-1',
    orderNumber: 'ORD-2026-000001',
    status: 'pending',
    paymentStatus: 'paid',
    productId: 'p1',
    customerId: 'c1',
    reservedQuantity: 2,
    butcherId: 'b1',
    butcherUserId: 'butcher-1',
    totalPrice: 100,
    currency: 'SAR',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    entitlements.getPermissionsForUser.mockResolvedValue({
      storeCommission: 1,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderLifecycleService,
        OrderStateMachineService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppNotificationsService, useValue: notifications },
        { provide: SocketEmitService, useValue: sockets },
        { provide: ButcherRankingService, useValue: ranking },
        { provide: SubscriptionEntitlementService, useValue: entitlements },
      ],
    }).compile();

    service = moduleRef.get(OrderLifecycleService);
  });

  function transitionTx(
    overrides: {
      inventoryItems?: Array<{ productId: string; reservedQuantity: number }>;
      nextStatus?: string;
      locked?: Partial<typeof lockedRow>;
      existingCommission?: { id: string } | null;
    } = {},
  ) {
    const locked = { ...lockedRow, ...overrides.locked };
    const executeRaw = jest.fn().mockResolvedValue(1);
    const orderUpdate = jest.fn().mockResolvedValue({
      id: 'order-1',
      orderNumber: 'ORD-2026-000001',
      status: overrides.nextStatus ?? 'cancelled',
      butcher: { id: 'b1', userId: 'butcher-1' },
    });
    const timelineCreate = jest.fn().mockResolvedValue({
      status: overrides.nextStatus ?? 'cancelled',
      note: 'المنتج غير متوفر',
      createdAt: new Date(),
    });
    const paymentCreate = jest.fn().mockResolvedValue({ id: 'pay-comm-1' });
    const paymentFindFirst = jest
      .fn()
      .mockResolvedValue(overrides.existingCommission ?? null);

    return {
      $queryRaw: jest.fn().mockResolvedValue([locked]),
      butcherOrderItem: {
        findMany: jest.fn().mockResolvedValue(overrides.inventoryItems ?? []),
      },
      butcherOrder: {
        findUnique: jest.fn(),
        update: orderUpdate,
      },
      orderTimeline: { create: timelineCreate },
      orderStatusAudit: { create: jest.fn().mockResolvedValue({}) },
      $executeRaw: executeRaw,
      executeRaw,
      orderUpdate,
      timelineCreate,
      paymentCreate,
      paymentFindFirst,
      payment: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: paymentFindFirst,
        create: paymentCreate,
      },
    };
  }

  it('returns existing order without writes when status unchanged', async () => {
    const existingOrder = {
      id: 'order-1',
      orderNumber: 'ORD-2026-000001',
      status: 'pending',
      butcher: { id: 'b1', userId: 'butcher-1' },
    };

    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          ...transitionTx(),
          butcherOrder: {
            findUnique: jest.fn().mockResolvedValue(existingOrder),
            update: jest.fn(),
          },
        }),
    );

    const result = await service.transitionOrder({
      orderId: 'order-1',
      actorId: 'butcher-1',
      nextStatus: 'pending',
    });

    expect(result).toEqual(existingOrder);
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
    expect(sockets.emitToUser).not.toHaveBeenCalled();
  });

  it('rejects confirm when order is unpaid', async () => {
    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          $queryRaw: jest
            .fn()
            .mockResolvedValue([{ ...lockedRow, paymentStatus: 'unpaid' }]),
          butcherOrderItem: { findMany: jest.fn() },
          butcherOrder: { findUnique: jest.fn(), update: jest.fn() },
          orderTimeline: { create: jest.fn() },
          orderStatusAudit: { create: jest.fn() },
          $executeRaw: jest.fn(),
        }),
    );

    await expect(
      service.transitionOrder({
        orderId: 'order-1',
        actorId: 'butcher-1',
        nextStatus: 'confirmed',
      }),
    ).rejects.toMatchObject({ error: 'payment_required', status: 402 });
  });

  it('creates timeline, audit, and notifies on valid transition', async () => {
    const tx = transitionTx({ nextStatus: 'confirmed' });
    tx.orderUpdate.mockResolvedValue({
      id: 'order-1',
      orderNumber: 'ORD-2026-000001',
      status: 'confirmed',
      butcher: { id: 'b1', userId: 'butcher-1' },
    });
    tx.timelineCreate.mockResolvedValue({
      status: 'confirmed',
      note: null,
      createdAt: new Date('2026-07-07T10:00:00Z'),
    });

    prisma.$transaction.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx),
    );

    const result = await service.transitionOrder({
      orderId: 'order-1',
      actorId: 'butcher-1',
      nextStatus: 'confirmed',
    });

    expect(result.status).toBe('confirmed');
    expect(tx.timelineCreate).toHaveBeenCalled();
    expect(notifications.notifyUsers).toHaveBeenCalled();
  });

  it('rejects invalid transitions inside the transaction', async () => {
    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(transitionTx()),
    );

    await expect(
      service.transitionOrder({
        orderId: 'order-1',
        actorId: 'butcher-1',
        nextStatus: 'delivered',
      }),
    ).rejects.toBeInstanceOf(ApiException);
  });

  it('stores cancellation reason and releases inventory for legacy header row', async () => {
    const tx = transitionTx();

    prisma.$transaction.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx),
    );

    await service.transitionOrder({
      orderId: 'order-1',
      actorId: 'butcher-1',
      nextStatus: 'cancelled',
      cancellationReason: 'المنتج غير متوفر',
    });

    expect(tx.executeRaw).toHaveBeenCalled();
    expect(tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          referenceType: 'butcher_order',
          referenceId: 'order-1',
          status: 'pending',
        }),
        data: { status: 'failed' },
      }),
    );
    expect(tx.timelineCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          note: 'المنتج غير متوفر',
          status: 'cancelled',
        }),
      }),
    );
  });

  it('releases inventory for each order item on cancel', async () => {
    const tx = transitionTx({
      inventoryItems: [
        { productId: 'p1', reservedQuantity: 2 },
        { productId: 'p2', reservedQuantity: 1.5 },
      ],
    });

    prisma.$transaction.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx),
    );

    await service.transitionOrder({
      orderId: 'order-1',
      actorId: 'butcher-1',
      nextStatus: 'cancelled',
    });

    expect(tx.executeRaw).toHaveBeenCalledTimes(2);
  });

  it('creates order with nested items in one transaction', async () => {
    const orderCreate = jest.fn().mockResolvedValue({
      id: 'order-new',
      orderNumber: 'ORD-2026-000001',
      status: 'pending',
      paymentStatus: 'unpaid',
      customerId: 'c1',
      butcher: { id: 'b1', userId: 'butcher-1', nameAr: 'ملحمة' },
      items: [{ productId: 'p1' }],
    });

    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          $executeRaw: jest.fn().mockResolvedValue(1),
          orderNumberSequence: {
            upsert: jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({ lastNumber: 1 }),
          },
          butcherOrder: { create: orderCreate },
          orderTimeline: { create: jest.fn().mockResolvedValue({}) },
        }),
    );

    await service.createOrder({
      butcherId: 'b1',
      customerId: 'c1',
      deliveryType: 'pickup',
      currency: 'SAR',
      totalPrice: 150,
      items: [
        {
          productId: 'p1',
          cutType: 'whole',
          weightKg: 2,
          linePrice: 100,
          reservedQuantity: 2,
        },
        {
          productId: 'p2',
          cutType: 'sliced',
          weightKg: 1,
          linePrice: 50,
          reservedQuantity: 1,
        },
      ],
    });

    expect(orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: 'p1',
          totalPrice: 150,
          items: {
            create: expect.arrayContaining([
              expect.objectContaining({ productId: 'p1', linePrice: 100 }),
              expect.objectContaining({ productId: 'p2', linePrice: 50 }),
            ]),
          },
        }),
      }),
    );
    expect(notifications.notifyUser).toHaveBeenCalled();
    expect(sockets.emitToUser).toHaveBeenCalledWith(
      'c1',
      'order.created',
      expect.objectContaining({ paymentStatus: 'unpaid' }),
    );
  });

  it('createCheckoutAttempt does not emit order.created or notify the butcher', async () => {
    const checkoutCreate = jest.fn().mockResolvedValue({
      id: 'chk-1',
      userId: 'c1',
      butcherId: 'b1',
      status: 'pending',
      totalPrice: 150,
      itemsSnapshot: [],
      expiresAt: new Date(Date.now() + 1800000),
    });
    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          $executeRaw: jest.fn().mockResolvedValue(1),
          butcherCheckout: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: checkoutCreate,
          },
        }),
    );

    const result = await service.createCheckoutAttempt({
      butcherId: 'b1',
      customerId: 'c1',
      deliveryType: 'pickup',
      currency: 'SAR',
      totalPrice: 150,
      items: [
        {
          productId: 'p1',
          cutType: 'whole',
          weightKg: 2,
          linePrice: 150,
          reservedQuantity: 2,
        },
      ],
    });

    expect(result.checkout.id).toBe('chk-1');
    expect(notifications.notifyUser).not.toHaveBeenCalled();
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
    expect(sockets.emitToUser).not.toHaveBeenCalled();
  });

  it('expires stale unpaid orders through the normal cancel path', async () => {
    prisma.$queryRaw = jest.fn().mockResolvedValue([{ id: 'order-1' }]);
    const transitionSpy = jest
      .spyOn(service, 'transitionOrder')
      .mockResolvedValue({
        id: 'order-1',
        status: 'cancelled',
      } as never);

    const result = await service.expireStaleUnpaidOrders(
      new Date('2026-08-17T08:00:00Z'),
    );

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(transitionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        nextStatus: 'cancelled',
      }),
    );
    expect(result).toEqual({ scanned: 1, expired: 1, skipped: 0 });
  });

  it('skips stale unpaid orders that fail transition safely', async () => {
    prisma.$queryRaw = jest
      .fn()
      .mockResolvedValue([{ id: 'order-1' }, { id: 'order-2' }]);
    jest
      .spyOn(service, 'transitionOrder')
      .mockRejectedValueOnce(new ApiException(409, 'inventory_conflict', 'x'))
      .mockResolvedValueOnce({
        id: 'order-2',
        status: 'cancelled',
      } as never);

    const result = await service.expireStaleUnpaidOrders(
      new Date('2026-08-17T08:00:00Z'),
    );

    expect(result).toEqual({ scanned: 2, expired: 1, skipped: 1 });
  });

  it('records 10% order commission once when order is delivered', async () => {
    const tx = transitionTx({
      nextStatus: 'delivered',
      locked: { status: 'ready', paymentStatus: 'paid', totalPrice: 100 },
      inventoryItems: [{ productId: 'p1', reservedQuantity: 1 }],
    });

    prisma.$transaction.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx),
    );

    await service.transitionOrder({
      orderId: 'order-1',
      actorId: 'butcher-1',
      nextStatus: 'delivered',
    });

    expect(tx.paymentCreate).toHaveBeenCalledTimes(1);
    expect(tx.paymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 10,
          currency: 'SAR',
          status: 'paid',
          referenceType: 'order_commission',
          referenceId: 'order-1',
          orderId: butcherOrderCommissionPaymentRef('order-1'),
          metadata: expect.objectContaining({
            kind: 'butcher_order_commission',
            ratePercent: 10,
            isExempt: false,
          }),
        }),
      }),
    );
  });

  it('does not create a second commission when ledger already exists', async () => {
    const tx = transitionTx({
      nextStatus: 'delivered',
      locked: { status: 'ready', paymentStatus: 'paid', totalPrice: 100 },
      inventoryItems: [{ productId: 'p1', reservedQuantity: 1 }],
      existingCommission: { id: 'pay-existing' },
    });

    prisma.$transaction.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx),
    );

    await service.transitionOrder({
      orderId: 'order-1',
      actorId: 'butcher-1',
      nextStatus: 'delivered',
    });

    expect(tx.paymentCreate).not.toHaveBeenCalled();
  });

  it('skips order commission when payment is not paid', async () => {
    // ready→delivered still allowed by state machine; unpaid should not accrue.
    const tx = transitionTx({
      nextStatus: 'delivered',
      locked: { status: 'ready', paymentStatus: 'unpaid', totalPrice: 100 },
      inventoryItems: [{ productId: 'p1', reservedQuantity: 1 }],
    });

    prisma.$transaction.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx),
    );

    await service.transitionOrder({
      orderId: 'order-1',
      actorId: 'butcher-1',
      nextStatus: 'delivered',
    });

    expect(tx.paymentCreate).not.toHaveBeenCalled();
  });

  it('records zero order commission when butcher is subscription-exempt', async () => {
    entitlements.getPermissionsForUser.mockResolvedValue({
      storeCommission: 0,
    });
    const tx = transitionTx({
      nextStatus: 'delivered',
      locked: { status: 'ready', paymentStatus: 'paid', totalPrice: 100 },
      inventoryItems: [{ productId: 'p1', reservedQuantity: 1 }],
    });

    prisma.$transaction.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx),
    );

    await service.transitionOrder({
      orderId: 'order-1',
      actorId: 'butcher-1',
      nextStatus: 'delivered',
    });

    expect(tx.paymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 0,
          metadata: expect.objectContaining({ isExempt: true }),
        }),
      }),
    );
  });

  it('does not accrue commission on cancel', async () => {
    const tx = transitionTx({ nextStatus: 'cancelled' });

    prisma.$transaction.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx),
    );

    await service.transitionOrder({
      orderId: 'order-1',
      actorId: 'butcher-1',
      nextStatus: 'cancelled',
    });

    expect(tx.paymentCreate).not.toHaveBeenCalled();
  });

  it('does not accrue commission on confirmed (non-delivered)', async () => {
    const tx = transitionTx({
      nextStatus: 'confirmed',
      locked: { status: 'pending', paymentStatus: 'paid', totalPrice: 100 },
    });

    prisma.$transaction.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx),
    );

    await service.transitionOrder({
      orderId: 'order-1',
      actorId: 'butcher-1',
      nextStatus: 'confirmed',
    });

    expect(tx.paymentCreate).not.toHaveBeenCalled();
  });

  it('idempotent: re-processing already delivered is a noop without new commission', async () => {
    const existingOrder = {
      id: 'order-1',
      orderNumber: 'ORD-2026-000001',
      status: 'delivered',
      butcher: { id: 'b1', userId: 'butcher-1' },
    };
    const tx = transitionTx({
      locked: {
        status: 'delivered',
        paymentStatus: 'paid',
        totalPrice: 100,
      },
    });
    tx.butcherOrder.findUnique = jest.fn().mockResolvedValue(existingOrder);

    prisma.$transaction.mockImplementation(
      async (fn: (txArg: unknown) => Promise<unknown>) => fn(tx),
    );

    const result = await service.transitionOrder({
      orderId: 'order-1',
      actorId: 'butcher-1',
      nextStatus: 'delivered',
    });

    expect(result).toEqual(existingOrder);
    expect(tx.paymentCreate).not.toHaveBeenCalled();
    expect(tx.paymentFindFirst).not.toHaveBeenCalled();
    expect(tx.orderUpdate).not.toHaveBeenCalled();
  });
});
