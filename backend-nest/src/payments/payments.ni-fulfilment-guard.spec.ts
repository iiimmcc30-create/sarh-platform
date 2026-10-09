import { PaymentsService } from './payments.service';
import { fetchNiOrderResolved } from './ni-client';
import { Sentry } from '../shared/lib/sentry';
import {
  checkNiOrderForFulfilment,
  extractNiOrderAmount,
} from './ni-fulfilment-guard';

jest.mock('./ni-client', () => {
  const actual = jest.requireActual('./ni-client') as Record<string, unknown>;
  return { ...actual, fetchNiOrderResolved: jest.fn() };
});
jest.mock('../shared/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
}));

const mockedFetchNi = fetchNiOrderResolved as jest.MockedFunction<
  typeof fetchNiOrderResolved
>;
const captureException = Sentry.captureException as jest.Mock;

const STORED_UUID = 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc';
const PAYLOAD_UUID = 'b24e92e4-38c5-49c7-99ef-33cacdd2f2ed';

function niOrder(value: number, currencyCode = 'SAR', state = 'PURCHASED') {
  return {
    order: {
      reference: STORED_UUID,
      state,
      amount: { currencyCode, value },
      merchantAttributes: { merchantOrderReference: 'SFAT-U1-ABC' },
    },
    state,
  };
}

function pendingPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    userId: 'u1',
    status: 'pending',
    amount: 49.5,
    currency: 'SAR',
    orderId: 'SFAT-U1-ABC',
    transactionId: STORED_UUID,
    metadata: { type: 'featured_ad', referenceId: 'listing-1' },
    referenceType: 'featured_ad',
    referenceId: 'listing-1',
    ...overrides,
  };
}

function makeService() {
  const repo = {
    findPaymentForWebhook: jest.fn(),
    findPaymentByIdFull: jest.fn(),
    findPaymentOwnedByUser: jest.fn(),
    processSuccessfulPayment: jest.fn().mockResolvedValue({ processed: true }),
    flagPaymentForReview: jest.fn().mockResolvedValue({ flagged: true }),
    markPaymentFailedById: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const notifications = { notifyUser: jest.fn(), notifyUsers: jest.fn() };
  const service = new PaymentsService(
    repo as never,
    logger as never,
    notifications as never,
    { invalidate: jest.fn() } as never,
    {
      notifyRenewalSuccess: jest.fn(),
      notifyRenewalFailed: jest.fn(),
    } as never,
    {} as never,
    {} as never,
    {
      delPattern: jest.fn().mockResolvedValue(undefined),
      del: jest.fn(),
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, repo, logger, notifications };
}

const webhook = (s: PaymentsService, event: Record<string, unknown>) =>
  (
    s as unknown as {
      handleNIWebhook: (e: Record<string, unknown>) => Promise<void>;
    }
  ).handleNIWebhook(event);

const forgedPaid = {
  eventName: 'ORDER.PAID',
  order: {
    reference: PAYLOAD_UUID,
    state: 'PURCHASED',
    amount: { currencyCode: 'SAR', value: 4950 },
    customData: { paymentId: 'pay-1' },
  },
};

describe('NI fulfilment guard (pure)', () => {
  it('reads NI minor-unit amounts', () => {
    expect(
      extractNiOrderAmount({ amount: { currencyCode: 'sar', value: 4950 } }),
    ).toEqual({ amount: 49.5, currency: 'SAR' });
    expect(extractNiOrderAmount({})).toBeNull();
    expect(
      extractNiOrderAmount({ amount: { currencyCode: 'SAR', value: 'x' } }),
    ).toBeNull();
  });

  it('requires captured/purchased + same amount + same currency', () => {
    const p = { amount: 49.5, currency: 'SAR' };
    expect(
      checkNiOrderForFulfilment(niOrder(4950).order, 'CAPTURED', p),
    ).toMatchObject({ ok: true });
    expect(
      checkNiOrderForFulfilment(niOrder(4950).order, 'PURCHASED', p),
    ).toMatchObject({ ok: true });
    expect(
      checkNiOrderForFulfilment(niOrder(4950).order, 'AUTHORISED', p),
    ).toEqual({ ok: false, reason: 'not_captured' });
    expect(
      checkNiOrderForFulfilment(niOrder(100).order, 'CAPTURED', p),
    ).toMatchObject({ ok: false, reason: 'amount_mismatch', niAmount: 1 });
    expect(
      checkNiOrderForFulfilment(niOrder(4950, 'AED').order, 'CAPTURED', p),
    ).toMatchObject({ ok: false, reason: 'currency_mismatch' });
    expect(
      checkNiOrderForFulfilment({ state: 'CAPTURED' }, 'CAPTURED', p),
    ).toEqual({ ok: false, reason: 'amount_missing' });
  });
});

describe('NI webhook → verified with the NI API before fulfilment', () => {
  const prevKey = process.env.NI_API_KEY;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NI_API_KEY = 'live_ci_test_key_not_mock';
  });
  afterAll(() => {
    if (prevKey === undefined) delete process.env.NI_API_KEY;
    else process.env.NI_API_KEY = prevKey;
  });

  it('fulfils when NI confirms state, amount and currency (fetched by the stored NI UUID, not the payload ref)', async () => {
    const { service, repo, notifications } = makeService();
    repo.findPaymentForWebhook.mockResolvedValue(pendingPayment());
    mockedFetchNi.mockResolvedValue(niOrder(4950));

    await webhook(service, forgedPaid);

    expect(mockedFetchNi).toHaveBeenCalledWith(
      STORED_UUID,
      expect.any(Function),
      expect.objectContaining({ maxAttempts: 2 }),
    );
    expect(repo.processSuccessfulPayment).toHaveBeenCalledTimes(1);
    expect(repo.processSuccessfulPayment.mock.calls[0][0]).toMatchObject({
      paymentId: 'pay-1',
      niTransactionId: STORED_UUID,
    });
    expect(repo.flagPaymentForReview).not.toHaveBeenCalled();
    expect(notifications.notifyUser).toHaveBeenCalledTimes(1);
  });

  it('a payload claiming PURCHASED is not enough: NI amount mismatch → review, no fulfilment, Sentry', async () => {
    const { service, repo, notifications, logger } = makeService();
    repo.findPaymentForWebhook.mockResolvedValue(pendingPayment());
    mockedFetchNi.mockResolvedValue(niOrder(100)); // 1.00 SAR paid at NI

    await webhook(service, forgedPaid);

    expect(repo.processSuccessfulPayment).not.toHaveBeenCalled();
    expect(notifications.notifyUser).not.toHaveBeenCalled();
    expect(repo.flagPaymentForReview).toHaveBeenCalledWith(
      'pay-1',
      expect.objectContaining({
        reason: 'amount_mismatch',
        source: 'webhook',
        niAmount: 1,
        expectedAmount: 49.5,
      }),
    );
    expect(logger.error).toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(String(captureException.mock.calls[0][0].message)).toContain(
      'amount_mismatch',
    );
  });

  it('currency mismatch → review, no fulfilment', async () => {
    const { service, repo } = makeService();
    repo.findPaymentForWebhook.mockResolvedValue(pendingPayment());
    mockedFetchNi.mockResolvedValue(niOrder(4950, 'AED'));

    await webhook(service, forgedPaid);

    expect(repo.processSuccessfulPayment).not.toHaveBeenCalled();
    expect(repo.flagPaymentForReview).toHaveBeenCalledWith(
      'pay-1',
      expect.objectContaining({ reason: 'currency_mismatch' }),
    );
  });

  it('NI not captured yet → nothing fulfilled and nothing flagged (auto-sync retries)', async () => {
    const { service, repo } = makeService();
    repo.findPaymentForWebhook.mockResolvedValue(pendingPayment());
    mockedFetchNi.mockResolvedValue(niOrder(4950, 'SAR', 'STARTED'));

    await webhook(service, forgedPaid);

    expect(repo.processSuccessfulPayment).not.toHaveBeenCalled();
    expect(repo.flagPaymentForReview).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('a payment already held for review is never fulfilled by a later webhook', async () => {
    const { service, repo } = makeService();
    repo.findPaymentForWebhook.mockResolvedValue(
      pendingPayment({ metadata: { reviewRequired: true } }),
    );
    mockedFetchNi.mockResolvedValue(niOrder(4950));

    await webhook(service, forgedPaid);

    expect(mockedFetchNi).not.toHaveBeenCalled();
    expect(repo.processSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('without NI credentials (mock mode) a success webhook fulfils nothing', async () => {
    process.env.NI_API_KEY = 'test_mock';
    const { service, repo } = makeService();
    repo.findPaymentForWebhook.mockResolvedValue(pendingPayment());

    await webhook(service, forgedPaid);

    expect(mockedFetchNi).not.toHaveBeenCalled();
    expect(repo.processSuccessfulPayment).not.toHaveBeenCalled();
  });

  it('no stored NI UUID: payload ref is fetched but must carry our merchant reference', async () => {
    const { service, repo } = makeService();
    repo.findPaymentForWebhook.mockResolvedValue(
      pendingPayment({ transactionId: null }),
    );
    const other = niOrder(4950);
    (
      other.order.merchantAttributes as Record<string, unknown>
    ).merchantOrderReference = 'SFAT-SOMEONE-ELSE';
    mockedFetchNi.mockResolvedValue(other);

    await webhook(service, forgedPaid);

    expect(mockedFetchNi).toHaveBeenCalledWith(
      PAYLOAD_UUID,
      expect.any(Function),
      expect.anything(),
    );
    expect(repo.processSuccessfulPayment).not.toHaveBeenCalled();
    expect(repo.flagPaymentForReview).toHaveBeenCalledWith(
      'pay-1',
      expect.objectContaining({ reason: 'order_reference_mismatch' }),
    );
  });

  it('duplicate success webhooks still fulfil once (idempotency kept)', async () => {
    const { service, repo, notifications } = makeService();
    repo.findPaymentForWebhook
      .mockResolvedValueOnce(pendingPayment())
      .mockResolvedValueOnce(pendingPayment({ status: 'paid' }));
    mockedFetchNi.mockResolvedValue(niOrder(4950));

    await webhook(service, forgedPaid);
    await webhook(service, forgedPaid);

    expect(repo.processSuccessfulPayment).toHaveBeenCalledTimes(1);
    expect(notifications.notifyUser).toHaveBeenCalledTimes(1);
  });

  it('manual sync applies the same amount check (mismatch → review, not paid)', async () => {
    const { service, repo } = makeService();
    const p = pendingPayment();
    repo.findPaymentOwnedByUser.mockResolvedValue(p);
    repo.findPaymentByIdFull.mockResolvedValue(p);
    mockedFetchNi.mockResolvedValue(niOrder(100, 'SAR', 'CAPTURED'));

    const result = await service.syncPayment(
      { userId: 'u1', role: 'USER' } as never,
      'pay-1',
    );

    expect(repo.processSuccessfulPayment).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'pending',
      outcome: 'processing',
      reviewRequired: true,
    });
    expect(repo.flagPaymentForReview).toHaveBeenCalledWith(
      'pay-1',
      expect.objectContaining({ reason: 'amount_mismatch', source: 'sync' }),
    );
  });
});

describe('dev-complete is impossible in production', () => {
  const prev = { env: process.env.NODE_ENV, key: process.env.NI_API_KEY };
  afterEach(() => {
    if (prev.env === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev.env;
    if (prev.key === undefined) delete process.env.NI_API_KEY;
    else process.env.NI_API_KEY = prev.key;
  });

  type Ctor = { prototype: Record<string, object> };
  const loadController = (path: string, name: string): Ctor =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require(path) as Record<string, Ctor>)[name];
  const routePath = (C: Ctor, method: string): unknown =>
    Reflect.getMetadata('path', C.prototype[method]);

  it('registers no route when NODE_ENV=production, even with mock NI keys', () => {
    process.env.NODE_ENV = 'production';
    process.env.NI_API_KEY = 'test_mock';
    jest.isolateModules(() => {
      const payments = loadController(
        './payments.controller',
        'PaymentsController',
      );
      const boost = loadController(
        '../listings/boost/listing-boost.controller',
        'ListingBoostController',
      );
      const promo = loadController(
        '../listings/promotion/listing-promotion.controller',
        'ListingPromotionController',
      );
      for (const C of [payments, boost, promo]) {
        expect(routePath(C, 'devComplete')).toBeUndefined();
      }
      // a normal route on the same controller is still registered
      expect(routePath(payments, 'initiate')).toBe('initiate');
    });
  });

  it('registers the route outside production', () => {
    process.env.NODE_ENV = 'test';
    jest.isolateModules(() => {
      const payments = loadController(
        './payments.controller',
        'PaymentsController',
      );
      expect(routePath(payments, 'devComplete')).toBe(':id/dev-complete');
    });
  });

  it('service refuses in production even in NI mock mode', async () => {
    process.env.NODE_ENV = 'production';
    process.env.NI_API_KEY = 'test_mock';
    const { service, repo } = makeService();
    await expect(
      service.simulateDevPayment({ userId: 'u1' } as never, 'pay-1'),
    ).rejects.toMatchObject({ status: 404 });
    expect(repo.findPaymentOwnedByUser).not.toHaveBeenCalled();
  });
});
