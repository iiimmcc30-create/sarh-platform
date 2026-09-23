import { Test } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PaymentsRepository } from './repositories/payments.repository';
import { LoggerService } from '../common/services/logger.service';
import { AppNotificationsService } from '../queue/services/app-notifications.service';
import { SubscriptionCacheService } from '../subscriptions/services/subscription-cache.service';
import { SubscriptionLifecycleService } from '../subscriptions/services/subscription-lifecycle.service';
import { SubscriptionEntitlementService } from '../subscriptions/services/subscription-entitlement.service';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import { PlansService } from '../plans/plans.service';
import { PaidServicesService } from '../settings/paid-services.service';
import { IntegrationCheckoutService } from '../integrations/services/integration-checkout.service';
import { SocketEmitService } from '../gateway/services/socket-emit.service';
import { fetchNiOrderResolved, verifyNiOrderForCheckout } from './ni-client';

jest.mock('./ni-client', () => {
  const actual = jest.requireActual('./ni-client') as Record<string, unknown>;
  return {
    ...actual,
    verifyNiOrderForCheckout: jest.fn(),
    fetchNiOrderResolved: jest.fn(),
  };
});

const mockedVerifyNi = verifyNiOrderForCheckout as jest.MockedFunction<
  typeof verifyNiOrderForCheckout
>;
const mockedFetchNi = fetchNiOrderResolved as jest.MockedFunction<
  typeof fetchNiOrderResolved
>;

describe('PaymentsService', () => {
  let service: PaymentsService;

  const repo = {
    findSubscriptionForPayment: jest.fn(),
    findPendingFee: jest.fn(),
    recordListingFeeSaleAmount: jest.fn().mockResolvedValue({ count: 1 }),
    findUnpaidButcherOrder: jest.fn(),
    findPayableButcherCheckout: jest.fn(),
    findOrderIdByCheckoutId: jest.fn(),
    findButcherOrderByPaymentId: jest.fn(),
    findOwnedListingForCommission: jest.fn(),
    findUserContact: jest.fn().mockResolvedValue({
      displayName: 'User',
      arabicName: 'مستخدم',
      email: 'u@example.com',
    }),
    createPendingPaymentOrReturnExisting: jest.fn(),
    createPendingPayment: jest.fn(),
    archiveInvalidPendingPayment: jest.fn(),
    markPaymentFailed: jest.fn(),
    updatePaymentCheckout: jest.fn(),
    findPaymentByIdFull: jest.fn(),
    findPaymentOwnedByUser: jest.fn(),
    findPaymentForWebhook: jest.fn(),
    processSuccessfulPayment: jest.fn(),
    markPaymentFailedById: jest.fn(),
    markPaymentRefunded: jest.fn(),
    markOrderCommissionRefunded: jest.fn(),
  };
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const notifications = {
    notifyUser: jest.fn(),
    notifyUsers: jest.fn(),
  };
  const subscriptionCache = { invalidate: jest.fn() };
  const subscriptionLifecycle = {
    shouldBlockPayment: jest.fn().mockReturnValue(false),
    notifyRenewalSuccess: jest.fn(),
    notifyRenewalFailed: jest.fn(),
    downgradeUser: jest.fn(),
  };
  const entitlements = {
    getAudienceForUser: jest.fn().mockResolvedValue('USER'),
  };
  const plans = {
    getUpgradablePlans: jest.fn().mockReturnValue(['sarh-pro']),
    getPlanPrice: jest.fn().mockReturnValue(100),
  };
  const cache = { delPattern: jest.fn(), del: jest.fn() };
  const paidServices = {
    assertListingFeesEnabled: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PaymentsRepository, useValue: repo },
        { provide: LoggerService, useValue: logger },
        { provide: AppNotificationsService, useValue: notifications },
        { provide: SubscriptionCacheService, useValue: subscriptionCache },
        {
          provide: SubscriptionLifecycleService,
          useValue: subscriptionLifecycle,
        },
        { provide: SubscriptionEntitlementService, useValue: entitlements },
        { provide: PlansService, useValue: plans },
        { provide: RedisCacheService, useValue: cache },
        { provide: PaidServicesService, useValue: paidServices },
        {
          provide: SocketEmitService,
          useValue: { emitToUser: jest.fn(), getServer: jest.fn() },
        },
        {
          provide: IntegrationCheckoutService,
          useValue: {
            createHostedCheckout: jest.fn().mockResolvedValue({
              checkoutUrl: 'https://checkout.example/pay',
              externalOrderId: 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc',
              merchantOrderReference: 'SFAT-U1-TEST',
              reused: false,
              mock: true,
            }),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(PaymentsService);
  });

  it('requires a listing reference for commission payments', async () => {
    await expect(
      service.initiate(
        { userId: 'u1', role: 'USER' } as never,
        { amount: 25, method: 'visa', type: 'commission' } as never,
      ),
    ).rejects.toMatchObject({ error: 'ref_required', status: 400 });
  });

  it('rejects listing fee payment when the fee is not owned or already paid', async () => {
    repo.findPendingFee.mockResolvedValue(null);

    await expect(
      service.initiate(
        { userId: 'u1', role: 'USER' } as never,
        {
          amount: 100,
          saleAmount: 10000,
          method: 'visa',
          type: 'listing_fee',
          referenceId: 'listing-b',
        } as never,
      ),
    ).rejects.toMatchObject({ error: 'fee_not_found', status: 404 });
  });

  it('quotes 1% of sale amount 10000 → 100 and stores listing_fee', async () => {
    repo.findPendingFee.mockResolvedValue({
      id: 'fee-a',
      listingId: 'listing-a',
      status: 'pending',
      commission: 50,
    });
    repo.createPendingPaymentOrReturnExisting.mockResolvedValue({
      payment: { id: 'pay-1', orderId: 'SFAT-U1-TEST' },
    });
    jest.spyOn(service as any, 'createCheckoutForPayment').mockResolvedValue({
      paymentId: 'pay-1',
      orderId: 'SFAT-U1-TEST',
      checkoutUrl: 'https://checkout.example/pay-1',
      status: 'pending',
      devMode: true,
    } as never);

    const result = await service.initiate(
      { userId: 'u1', role: 'USER' } as never,
      {
        amount: 100,
        saleAmount: 10000,
        method: 'visa',
        type: 'listing_fee',
        referenceId: 'listing-a',
      } as never,
    );

    expect(repo.recordListingFeeSaleAmount).toHaveBeenCalledWith(
      'fee-a',
      'u1',
      10000,
      100,
    );
    expect(result.paymentId).toBe('pay-1');
  });

  it('rejects invalid sale amounts', async () => {
    repo.findPendingFee.mockResolvedValue({
      id: 'fee-a',
      listingId: 'listing-a',
      status: 'pending',
      commission: 1,
    });

    await expect(
      service.initiate(
        { userId: 'u1', role: 'USER' } as never,
        {
          amount: 1,
          saleAmount: -5,
          method: 'visa',
          type: 'listing_fee',
          referenceId: 'listing-a',
        } as never,
      ),
    ).rejects.toMatchObject({ error: 'invalid_sale_amount', status: 400 });
  });

  it('rejects order_commission as a customer checkout type', async () => {
    await expect(
      service.initiate(
        { userId: 'u1', role: 'USER' } as never,
        {
          amount: 10,
          method: 'visa',
          type: 'order_commission',
          referenceId: 'order-1',
        } as never,
      ),
    ).rejects.toMatchObject({ error: 'invalid_type', status: 400 });
  });

  it('returns 500 when a verified webhook fails during processing', async () => {
    jest
      .spyOn(service as any, 'handleNIWebhook')
      .mockRejectedValue(new Error('boom'));

    const result = await service.processWebhook(
      JSON.stringify({ eventName: 'ORDER.PAID', order: { reference: 'x' } }),
    );

    expect(result).toEqual({
      status: 500,
      body: { error: 'webhook_processing_failed' },
    });
  });

  it('does not call NI sync when only internal merchant ref exists', async () => {
    const prevKey = process.env.NI_API_KEY;
    process.env.NI_API_KEY = 'live_ci_test_key_not_mock';
    try {
      repo.findPaymentOwnedByUser.mockResolvedValue({
        id: 'pay-ftr',
        status: 'pending',
        orderId: 'FTR-4916FD-MSPXSTSH',
        transactionId: null,
      });
      repo.findPaymentByIdFull.mockResolvedValue({
        id: 'pay-ftr',
        status: 'pending',
        orderId: 'FTR-4916FD-MSPXSTSH',
        transactionId: null,
      });

      const result = await service.syncPayment(
        { userId: 'u1', role: 'USER' } as never,
        'pay-ftr',
      );

      expect(result).toMatchObject({
        paymentId: 'pay-ftr',
        status: 'pending',
        synced: false,
        outcome: 'processing',
      });
      expect(result.messageAr).toContain('N-Genius');
    } finally {
      if (prevKey === undefined) delete process.env.NI_API_KEY;
      else process.env.NI_API_KEY = prevKey;
    }
  });

  it('recovers a stale pending payment that never received a checkout URL', async () => {
    repo.findPendingFee.mockResolvedValue({
      id: 'fee-a',
      listingId: 'listing-a',
      status: 'pending',
      commission: 1,
    });
    repo.createPendingPaymentOrReturnExisting.mockResolvedValue({
      existingPending: {
        id: 'pay-stuck',
        checkoutUrl: null,
        orderId: 'SFAT-STUCK',
        transactionId: null,
        createdAt: new Date(Date.now() - 3 * 60 * 1000),
      },
    });
    repo.archiveInvalidPendingPayment.mockResolvedValue({ id: 'pay-stuck' });
    repo.createPendingPayment.mockResolvedValue({
      id: 'pay-fresh',
      orderId: 'SFAT-FRESH',
    });
    jest.spyOn(service as any, 'createCheckoutForPayment').mockResolvedValue({
      paymentId: 'pay-fresh',
      orderId: 'SFAT-FRESH',
      checkoutUrl: 'https://checkout.example/pay-fresh',
      status: 'pending',
      devMode: true,
    } as never);

    const result = await service.initiate(
      { userId: 'u1', role: 'USER' } as never,
      {
        amount: 100,
        saleAmount: 10000,
        method: 'visa',
        type: 'listing_fee',
        referenceId: 'listing-a',
      } as never,
    );

    expect(repo.archiveInvalidPendingPayment).toHaveBeenCalledWith(
      'pay-stuck',
      'ni_order_invalid_or_expired',
      { supersededBy: 'new_ni_order' },
    );
    expect(repo.createPendingPayment).toHaveBeenCalled();
    expect(result.paymentId).toBe('pay-fresh');
    expect(repo.findPaymentByIdFull).not.toHaveBeenCalled();
  });

  it('rejects butcher-checkout payment that is not owned or is expired', async () => {
    repo.findPayableButcherCheckout.mockResolvedValue(null);

    await expect(
      service.initiate(
        { userId: 'stranger', role: 'USER' } as never,
        {
          amount: 80,
          method: 'mada',
          type: 'butcher_checkout',
          referenceId: 'chk-1',
        } as never,
      ),
    ).rejects.toMatchObject({ error: 'checkout_not_found', status: 404 });
    expect(repo.createPendingPaymentOrReturnExisting).not.toHaveBeenCalled();
  });

  it('rejects butcher-order payment for another customer', async () => {
    repo.findUnpaidButcherOrder.mockResolvedValue(null);

    await expect(
      service.initiate(
        { userId: 'stranger', role: 'USER' } as never,
        {
          amount: 100,
          method: 'mada',
          type: 'butcher_order',
          referenceId: 'ord-1',
        } as never,
      ),
    ).rejects.toMatchObject({ error: 'order_not_found', status: 404 });

    expect(repo.findUnpaidButcherOrder).toHaveBeenCalledWith(
      'ord-1',
      'stranger',
    );
    expect(repo.createPendingPaymentOrReturnExisting).not.toHaveBeenCalled();
  });

  it('rejects butcher-order payment when the order is no longer payable', async () => {
    repo.findUnpaidButcherOrder.mockResolvedValue(null);

    await expect(
      service.initiate(
        { userId: 'u1', role: 'USER' } as never,
        {
          amount: 100,
          method: 'mada',
          type: 'butcher_order',
          referenceId: 'ord-cancelled',
        } as never,
      ),
    ).rejects.toMatchObject({ error: 'order_not_found', status: 404 });
  });

  it('archives a previous pending butcher payment only when NI says the checkout is unusable', async () => {
    repo.findUnpaidButcherOrder.mockResolvedValue({
      id: 'ord-1',
      totalPrice: 100,
      currency: 'SAR',
      orderNumber: 'ORD-1',
      butcherId: 'b1',
      status: 'pending',
      paymentStatus: 'unpaid',
    });
    repo.createPendingPaymentOrReturnExisting.mockResolvedValue({
      existingPending: {
        id: 'pay-old',
        checkoutUrl: 'https://ni.example/old-session',
        orderId: 'SFAT-OLD',
        transactionId: 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc',
        createdAt: new Date(),
      },
    });
    repo.archiveInvalidPendingPayment.mockResolvedValue({ id: 'pay-old' });
    repo.createPendingPayment.mockResolvedValue({
      id: 'pay-new',
      orderId: 'SFAT-NEW',
    });
    const prevKey = process.env.NI_API_KEY;
    process.env.NI_API_KEY = 'live_ci_test_key_not_mock';
    mockedVerifyNi.mockResolvedValue({
      valid: false,
      reason: 'order_not_usable',
      state: 'FAILED',
    });
    jest.spyOn(service as any, 'createCheckoutForPayment').mockResolvedValue({
      paymentId: 'pay-new',
      orderId: 'SFAT-NEW',
      checkoutUrl: 'https://checkout.example/new',
      status: 'pending',
      devMode: true,
    } as never);

    try {
      const result = await service.initiate(
        { userId: 'u1', role: 'USER' } as never,
        {
          amount: 100,
          method: 'mada',
          type: 'butcher_order',
          referenceId: 'ord-1',
        } as never,
      );

      expect(mockedVerifyNi).toHaveBeenCalled();
      expect(repo.archiveInvalidPendingPayment).toHaveBeenCalledWith(
        'pay-old',
        'ni_order_invalid_or_expired',
        { supersededBy: 'new_ni_order' },
      );
      expect(repo.createPendingPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceId: 'ord-1',
          referenceType: 'butcher_order',
          amount: 100,
        }),
      );
      expect(result.paymentId).toBe('pay-new');
    } finally {
      if (prevKey === undefined) delete process.env.NI_API_KEY;
      else process.env.NI_API_KEY = prevKey;
    }
  });

  it('retries a butcher order whose previous Payment failed while the order stays unpaid', async () => {
    repo.findUnpaidButcherOrder.mockResolvedValue({
      id: 'ord-1',
      totalPrice: 80,
      currency: 'SAR',
      orderNumber: 'ORD-1',
      butcherId: 'b1',
      status: 'pending',
      paymentStatus: 'failed',
    });
    repo.createPendingPaymentOrReturnExisting.mockResolvedValue({
      payment: { id: 'pay-retry', orderId: 'SFAT-RETRY' },
    });
    jest.spyOn(service as any, 'createCheckoutForPayment').mockResolvedValue({
      paymentId: 'pay-retry',
      orderId: 'SFAT-RETRY',
      checkoutUrl: 'https://checkout.example/retry',
      status: 'pending',
      devMode: true,
    } as never);

    const result = await service.initiate(
      { userId: 'u1', role: 'USER' } as never,
      {
        amount: 80,
        method: 'mada',
        type: 'butcher_order',
        referenceId: 'ord-1',
      } as never,
    );

    expect(result.paymentId).toBe('pay-retry');
    expect(repo.findUnpaidButcherOrder).toHaveBeenCalledWith('ord-1', 'u1');
  });

  it('does not archive or recreate checkout when NI reports already_paid (listing fee)', async () => {
    repo.findPendingFee.mockResolvedValue({
      id: 'fee-a',
      listingId: 'listing-a',
      status: 'pending',
      commission: 1,
    });
    repo.createPendingPaymentOrReturnExisting.mockResolvedValue({
      existingPending: {
        id: 'pay-cap',
        checkoutUrl: 'https://ni.example/old',
        orderId: 'SFAT-OLD',
        transactionId: 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc',
        createdAt: new Date(),
      },
    });
    repo.findPaymentByIdFull.mockResolvedValue({
      id: 'pay-cap',
      status: 'paid',
      orderId: 'SFAT-OLD',
      transactionId: 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc',
    });
    const createSpy = jest
      .spyOn(service as any, 'createCheckoutForPayment')
      .mockResolvedValue({ paymentId: 'should-not' } as never);
    const syncSpy = jest
      .spyOn(service as any, 'syncPaymentByOrderRef')
      .mockResolvedValue({ paymentId: 'pay-cap', status: 'paid' });

    const prevKey = process.env.NI_API_KEY;
    process.env.NI_API_KEY = 'live_ci_test_key_not_mock';
    mockedVerifyNi.mockResolvedValue({
      valid: false,
      reason: 'already_paid',
      state: 'CAPTURED',
      niOrderReference: 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc',
    });

    try {
      const result = await service.initiate(
        { userId: 'u1', role: 'USER' } as never,
        {
          amount: 100,
          saleAmount: 10000,
          method: 'visa',
          type: 'listing_fee',
          referenceId: 'listing-a',
        } as never,
      );

      expect(result).toMatchObject({
        paymentId: 'pay-cap',
        status: 'paid',
        alreadyPaid: true,
      });
      expect(repo.archiveInvalidPendingPayment).not.toHaveBeenCalled();
      expect(repo.createPendingPayment).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
      expect(syncSpy).toHaveBeenCalledWith('pay-cap', 'SFAT-OLD');
    } finally {
      if (prevKey === undefined) delete process.env.NI_API_KEY;
      else process.env.NI_API_KEY = prevKey;
    }
  });

  it('does not archive or recreate checkout when butcher pending is already_paid', async () => {
    repo.findUnpaidButcherOrder.mockResolvedValue({
      id: 'ord-1',
      totalPrice: 100,
      currency: 'SAR',
      orderNumber: 'ORD-1',
      butcherId: 'b1',
      status: 'pending',
      paymentStatus: 'unpaid',
    });
    repo.createPendingPaymentOrReturnExisting.mockResolvedValue({
      existingPending: {
        id: 'pay-old',
        checkoutUrl: 'https://ni.example/old-session',
        orderId: 'SFAT-OLD',
        transactionId: 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc',
        createdAt: new Date(),
      },
    });
    repo.findPaymentByIdFull.mockResolvedValue({
      id: 'pay-old',
      status: 'paid',
      orderId: 'SFAT-OLD',
    });
    const createSpy = jest
      .spyOn(service as any, 'createCheckoutForPayment')
      .mockResolvedValue({ paymentId: 'should-not' } as never);
    jest
      .spyOn(service as any, 'syncPaymentByOrderRef')
      .mockResolvedValue({ paymentId: 'pay-old', status: 'paid' });

    const prevKey = process.env.NI_API_KEY;
    process.env.NI_API_KEY = 'live_ci_test_key_not_mock';
    mockedVerifyNi.mockResolvedValue({
      valid: false,
      reason: 'already_paid',
      state: 'CAPTURED',
    });

    try {
      const result = await service.initiate(
        { userId: 'u1', role: 'USER' } as never,
        {
          amount: 100,
          method: 'mada',
          type: 'butcher_order',
          referenceId: 'ord-1',
        } as never,
      );

      expect(result).toMatchObject({
        paymentId: 'pay-old',
        status: 'paid',
        alreadyPaid: true,
      });
      expect(repo.archiveInvalidPendingPayment).not.toHaveBeenCalled();
      expect(repo.createPendingPayment).not.toHaveBeenCalled();
      expect(createSpy).not.toHaveBeenCalled();
    } finally {
      if (prevKey === undefined) delete process.env.NI_API_KEY;
      else process.env.NI_API_KEY = prevKey;
    }
  });

  it('does not demote a paid payment when a delayed failure webhook arrives', async () => {
    repo.findPaymentForWebhook.mockResolvedValue({
      id: 'pay-paid',
      status: 'paid',
      userId: 'u1',
      amount: 50,
      currency: 'SAR',
      metadata: { type: 'listing_fee', referenceId: 'fee-a' },
      referenceType: 'listing_fee',
      referenceId: 'fee-a',
    });
    repo.markPaymentFailedById.mockResolvedValue({ count: 0 });

    await (service as any).handleNIWebhook({
      eventName: 'ORDER.FAILED',
      order: {
        reference: 'ni-1',
        state: 'FAILED',
        customData: { paymentId: 'pay-paid' },
      },
    });

    expect(repo.markPaymentFailedById).not.toHaveBeenCalled();
    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  it('does not apply failure when local status is already paid (captured)', async () => {
    repo.findPaymentForWebhook.mockResolvedValue({
      id: 'pay-cap',
      status: 'paid',
      userId: 'u1',
      amount: 50,
      currency: 'SAR',
      metadata: {},
      referenceType: 'butcher_order',
      referenceId: 'ord-1',
    });

    await (service as any).handleNIWebhook({
      eventName: 'ORDER.DECLINED',
      order: {
        reference: 'ni-1',
        state: 'DECLINED',
        customData: { paymentId: 'pay-cap' },
      },
    });

    expect(repo.markPaymentFailedById).not.toHaveBeenCalled();
  });

  it('records capture after cancel without fulfilling the order', async () => {
    repo.findPaymentForWebhook.mockResolvedValue({
      id: 'pay-late',
      status: 'failed',
      userId: 'u1',
      amount: 80,
      currency: 'SAR',
      metadata: { type: 'butcher_order', referenceId: 'ord-1' },
      referenceType: 'butcher_order',
      referenceId: 'ord-1',
    });
    repo.processSuccessfulPayment.mockResolvedValue({
      processed: false,
      capturedAfterCancel: true,
    });

    await (service as any).handleNIWebhook({
      eventName: 'ORDER.CAPTURED',
      order: {
        reference: 'ni-cap',
        state: 'CAPTURED',
        customData: { paymentId: 'pay-late', type: 'butcher_order' },
      },
    });

    expect(repo.processSuccessfulPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'pay-late',
        type: 'butcher_order',
        referenceId: 'ord-1',
      }),
    );
    expect(notifications.notifyUser).not.toHaveBeenCalledWith(
      expect.objectContaining({
        titleAr: expect.stringContaining('طلب'),
      }),
    );
  });

  it('syncs butcher order paymentStatus on refund and ignores a duplicate refund webhook', async () => {
    repo.findPaymentForWebhook
      .mockResolvedValueOnce({
        id: 'pay-1',
        status: 'paid',
        userId: 'u1',
        amount: 80,
        currency: 'SAR',
        metadata: { type: 'butcher_order' },
        referenceType: 'butcher_order',
        referenceId: 'ord-1',
      })
      .mockResolvedValueOnce({
        id: 'pay-1',
        status: 'refunded',
        userId: 'u1',
        amount: 80,
        currency: 'SAR',
        metadata: { type: 'butcher_order' },
        referenceType: 'butcher_order',
        referenceId: 'ord-1',
      });
    repo.markPaymentRefunded.mockResolvedValue({
      id: 'pay-1',
      status: 'refunded',
      newlyRefunded: true,
    });
    repo.markOrderCommissionRefunded.mockResolvedValue({ id: 'boc-1' });

    const event = {
      eventName: 'ORDER.REFUNDED',
      order: {
        reference: 'ni-1',
        state: 'REFUNDED',
        customData: { paymentId: 'pay-1' },
      },
    };

    await (service as any).handleNIWebhook(event);
    await (service as any).handleNIWebhook(event);

    expect(repo.markPaymentRefunded).toHaveBeenCalledTimes(1);
    expect(repo.markOrderCommissionRefunded).toHaveBeenCalledTimes(1);
  });

  it('does not fulfill or notify twice for a duplicate success webhook', async () => {
    repo.findPaymentForWebhook
      .mockResolvedValueOnce({
        id: 'pay-s',
        status: 'pending',
        userId: 'u1',
        amount: 100,
        currency: 'SAR',
        metadata: { type: 'listing_fee' },
        referenceType: 'listing_fee',
        referenceId: 'fee-1',
      })
      .mockResolvedValueOnce({
        id: 'pay-s',
        status: 'paid',
        userId: 'u1',
        amount: 100,
        currency: 'SAR',
        metadata: { type: 'listing_fee' },
        referenceType: 'listing_fee',
        referenceId: 'fee-1',
      });
    repo.processSuccessfulPayment.mockResolvedValue({ processed: true });

    const event = {
      eventName: 'ORDER.PAID',
      order: {
        reference: 'ni-s',
        state: 'PURCHASED',
        customData: { paymentId: 'pay-s' },
      },
    };

    await (service as any).handleNIWebhook(event);
    await (service as any).handleNIWebhook(event);

    expect(repo.processSuccessfulPayment).toHaveBeenCalledTimes(1);
    expect(notifications.notifyUser).toHaveBeenCalledTimes(1);
  });

  it('success then duplicate success after state is already paid is a no-op', async () => {
    repo.findPaymentForWebhook.mockResolvedValue({
      id: 'pay-s',
      status: 'paid',
      userId: 'u1',
      amount: 100,
      currency: 'SAR',
      metadata: {},
      referenceType: 'listing_fee',
      referenceId: 'fee-1',
    });

    await (service as any).handleNIWebhook({
      eventName: 'ORDER.PAID',
      order: {
        reference: 'ni-s',
        state: 'PURCHASED',
        customData: { paymentId: 'pay-s' },
      },
    });

    expect(repo.processSuccessfulPayment).not.toHaveBeenCalled();
    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  it('skips refund side-effects when markPaymentRefunded reports not newly refunded', async () => {
    repo.findPaymentForWebhook.mockResolvedValue({
      id: 'pay-1',
      status: 'paid',
      userId: 'u1',
      amount: 80,
      currency: 'SAR',
      metadata: { type: 'butcher_order' },
      referenceType: 'butcher_order',
      referenceId: 'ord-1',
    });
    repo.markPaymentRefunded.mockResolvedValue({
      id: 'pay-1',
      status: 'refunded',
      newlyRefunded: false,
    });

    await (service as any).handleNIWebhook({
      eventName: 'ORDER.REFUNDED',
      order: {
        reference: 'ni-1',
        state: 'REFUNDED',
        customData: { paymentId: 'pay-1' },
      },
    });

    expect(repo.markOrderCommissionRefunded).not.toHaveBeenCalled();
    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  it('accepts a client-declared saleAmount of 1 (no server-side sale source)', async () => {
    repo.findPendingFee.mockResolvedValue({
      id: 'fee-a',
      listingId: 'listing-a',
      status: 'pending',
      commission: 1,
    });
    repo.createPendingPaymentOrReturnExisting.mockResolvedValue({
      payment: { id: 'pay-1', orderId: 'SFAT-U1-TEST' },
    });
    jest.spyOn(service as any, 'createCheckoutForPayment').mockResolvedValue({
      paymentId: 'pay-1',
      orderId: 'SFAT-U1-TEST',
      checkoutUrl: 'https://checkout.example/pay-1',
      status: 'pending',
      devMode: true,
    } as never);

    await service.initiate(
      { userId: 'u1', role: 'USER' } as never,
      {
        amount: 0.01,
        saleAmount: 1,
        method: 'visa',
        type: 'listing_fee',
        referenceId: 'listing-a',
      } as never,
    );

    expect(repo.recordListingFeeSaleAmount).toHaveBeenCalledWith(
      'fee-a',
      'u1',
      1,
      0.01,
    );
  });

  it('sync after webhook returns paid + needsReconciliation without a butcherOrder', async () => {
    repo.findPaymentOwnedByUser.mockResolvedValue({
      id: 'pay-late',
      status: 'paid',
      userId: 'u1',
      metadata: {
        type: 'butcher_checkout',
        capturedAfterCancel: true,
        needsReconciliation: true,
      },
    });

    const result = await service.syncPayment(
      { userId: 'u1', role: 'USER' } as never,
      'pay-late',
    );

    expect(result).toMatchObject({
      paymentId: 'pay-late',
      status: 'paid',
      capturedAfterCancel: true,
      needsReconciliation: true,
    });
    expect(result.butcherOrder).toBeUndefined();
    expect(repo.findButcherOrderByPaymentId).not.toHaveBeenCalled();
  });

  it('sync after webhook returns the Final Order that was actually stored', async () => {
    repo.findPaymentOwnedByUser.mockResolvedValue({
      id: 'pay-ok',
      status: 'paid',
      userId: 'u1',
      metadata: { type: 'butcher_checkout' },
    });
    repo.findButcherOrderByPaymentId.mockResolvedValue({
      id: 'ord-final',
      orderNumber: 'ORD-2026-000001',
      butcherId: 'b1',
      paymentStatus: 'paid',
      status: 'pending',
    });

    const result = await service.syncPayment(
      { userId: 'u1', role: 'USER' } as never,
      'pay-ok',
    );

    expect(result.status).toBe('paid');
    expect(result.butcherOrder).toEqual(
      expect.objectContaining({
        id: 'ord-final',
        paymentStatus: 'paid',
      }),
    );
    expect(result.needsReconciliation).toBeUndefined();
  });

  it('sync does not report paid when NI succeeded but the DB payment is still failed', async () => {
    const prevKey = process.env.NI_API_KEY;
    process.env.NI_API_KEY = 'live_ci_test_key_not_mock';
    const niUuid = 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc';
    repo.findPaymentOwnedByUser.mockResolvedValue({
      id: 'pay-stuck',
      status: 'failed',
      userId: 'u1',
      orderId: niUuid,
      transactionId: niUuid,
      metadata: { type: 'listing_fee' },
      referenceType: 'listing_fee',
      referenceId: 'fee-1',
    });
    repo.findPaymentByIdFull.mockResolvedValue({
      id: 'pay-stuck',
      status: 'failed',
      userId: 'u1',
      orderId: niUuid,
      transactionId: niUuid,
      metadata: { type: 'listing_fee' },
      referenceType: 'listing_fee',
      referenceId: 'fee-1',
    });
    repo.processSuccessfulPayment.mockResolvedValue({ processed: false });
    mockedFetchNi.mockResolvedValue({
      order: { reference: 'ni-1', state: 'CAPTURED', transactionId: 'ni-1' },
      state: 'CAPTURED',
    });

    try {
      const result = await service.syncPayment(
        { userId: 'u1', role: 'USER' } as never,
        'pay-stuck',
      );
      expect(result.status).toBe('failed');
      expect(result.outcome).toBe('failed');
      expect(result.butcherOrder).toBeUndefined();
    } finally {
      if (prevKey === undefined) delete process.env.NI_API_KEY;
      else process.env.NI_API_KEY = prevKey;
    }
  });

  it('sync after failed→paid checkout without an order returns DB reconciliation flags', async () => {
    const prevKey = process.env.NI_API_KEY;
    process.env.NI_API_KEY = 'live_ci_test_key_not_mock';
    const niUuid = 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc';
    repo.findPaymentOwnedByUser.mockResolvedValue({
      id: 'pay-late',
      status: 'failed',
      userId: 'u1',
      orderId: niUuid,
      transactionId: niUuid,
      metadata: { type: 'butcher_checkout' },
      referenceType: 'butcher_checkout',
      referenceId: 'chk-1',
    });
    repo.findPaymentByIdFull
      .mockResolvedValueOnce({
        id: 'pay-late',
        status: 'failed',
        userId: 'u1',
        orderId: niUuid,
        transactionId: niUuid,
        metadata: { type: 'butcher_checkout' },
        referenceType: 'butcher_checkout',
        referenceId: 'chk-1',
      })
      .mockResolvedValueOnce({
        id: 'pay-late',
        status: 'paid',
        metadata: {
          type: 'butcher_checkout',
          capturedAfterCancel: true,
          needsReconciliation: true,
        },
      });
    repo.processSuccessfulPayment.mockResolvedValue({
      processed: false,
      capturedAfterCancel: true,
    });
    mockedFetchNi.mockResolvedValue({
      order: {
        reference: 'ni-cap',
        state: 'CAPTURED',
        transactionId: 'ni-cap',
      },
      state: 'CAPTURED',
    });

    try {
      const result = await service.syncPayment(
        { userId: 'u1', role: 'USER' } as never,
        'pay-late',
      );
      expect(result).toMatchObject({
        status: 'paid',
        capturedAfterCancel: true,
        needsReconciliation: true,
      });
      expect(result.butcherOrder).toBeUndefined();
    } finally {
      if (prevKey === undefined) delete process.env.NI_API_KEY;
      else process.env.NI_API_KEY = prevKey;
    }
  });

  it('legacy cancelled butcher_order capture still records without fulfillment notify', async () => {
    repo.findPaymentForWebhook.mockResolvedValue({
      id: 'pay-legacy',
      status: 'failed',
      userId: 'u1',
      amount: 80,
      currency: 'SAR',
      metadata: { type: 'butcher_order', referenceId: 'ord-1' },
      referenceType: 'butcher_order',
      referenceId: 'ord-1',
    });
    repo.processSuccessfulPayment.mockResolvedValue({
      processed: false,
      capturedAfterCancel: true,
    });

    await (service as any).handleNIWebhook({
      eventName: 'ORDER.CAPTURED',
      order: {
        reference: 'ni-cap',
        state: 'CAPTURED',
        customData: { paymentId: 'pay-legacy', type: 'butcher_order' },
      },
    });

    expect(repo.processSuccessfulPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'butcher_order',
        referenceId: 'ord-1',
      }),
    );
    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  describe('verifyWebhookSignature', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevSecret = process.env.NI_WEBHOOK_SECRET;

    afterEach(() => {
      process.env.NODE_ENV = prevEnv;
      if (prevSecret === undefined) delete process.env.NI_WEBHOOK_SECRET;
      else process.env.NI_WEBHOOK_SECRET = prevSecret;
    });

    it('fails closed in production when the signature is missing', () => {
      process.env.NODE_ENV = 'production';
      process.env.NI_WEBHOOK_SECRET = 'webhook-secret';
      expect(service.verifyWebhookSignature('{}', undefined)).toEqual({
        ok: false,
        status: 401,
        error: 'missing_signature',
      });
    });

    it('rejects an invalid signature', () => {
      process.env.NI_WEBHOOK_SECRET = 'webhook-secret';
      expect(service.verifyWebhookSignature('{}', 'not-a-valid-hmac')).toEqual({
        ok: false,
        status: 401,
        error: 'invalid_signature',
      });
    });
  });
});
