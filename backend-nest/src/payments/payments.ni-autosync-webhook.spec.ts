import crypto from 'crypto';
import { PaymentsService } from './payments.service';
import { PaymentsRepository } from './repositories/payments.repository';
import { fetchNiOrderResolved, NiGatewayError } from './ni-client';
import { Sentry } from '../shared/lib/sentry';
import {
  DEFAULT_NI_WEBHOOK_HEADER,
  niFixedSecretMatches,
  niWebhookHeaderName,
  readNiWebhookFixedHeader,
} from '../integrations/utils/ni-webhook-header.util';

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

const NI_UUID = 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc';
const NI_UUID_2 = 'b24e92e4-38c5-49c7-99ef-33cacdd2f2ed';

function makeService() {
  const repo = {
    findStalePendingPayments: jest.fn(),
    findPaymentByIdFull: jest.fn(),
    findPaymentOwnedByUser: jest.fn(),
    markPaymentFailedById: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const notifications = { notifyUser: jest.fn(), notifyUsers: jest.fn() };
  const lifecycle = { notifyRenewalFailed: jest.fn() };
  const service = new PaymentsService(
    repo as never,
    logger as never,
    notifications as never,
    {} as never,
    lifecycle as never,
    {} as never,
    {} as never,
    { delPattern: jest.fn(), del: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, repo, logger, notifications };
}

const runAutoSync = (s: PaymentsService) =>
  (s as unknown as { runAutoSync: () => Promise<void> }).runAutoSync();

describe('NI auto-sync (quiet polling)', () => {
  const prevKey = process.env.NI_API_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NI_API_KEY = 'live_ci_test_key_not_mock';
  });
  afterAll(() => {
    if (prevKey === undefined) delete process.env.NI_API_KEY;
    else process.env.NI_API_KEY = prevKey;
  });

  it('queries pending payments older than 10 min and newer than 7 days', async () => {
    const { service, repo } = makeService();
    repo.findStalePendingPayments.mockResolvedValue([]);
    await runAutoSync(service);
    expect(repo.findStalePendingPayments).toHaveBeenCalledWith(10, 7);
    expect(mockedFetchNi).not.toHaveBeenCalled();
  });

  it('repository applies the 7-day lower bound and 10-minute upper bound', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PaymentsRepository({
      payment: { findMany },
    } as never);
    const now = Date.now();
    await repository.findStalePendingPayments(10, 7);
    const where = findMany.mock.calls[0][0].where;
    expect(where.status).toBe('pending');
    const lt = (where.createdAt.lt as Date).getTime();
    const gte = (where.createdAt.gte as Date).getTime();
    expect(Math.abs(lt - (now - 10 * 60 * 1000))).toBeLessThan(5000);
    expect(Math.abs(gte - (now - 7 * 24 * 60 * 60 * 1000))).toBeLessThan(5000);

    findMany.mockClear();
    await repository.findStalePendingPayments(10);
    expect(findMany.mock.calls[0][0].where.createdAt.gte).toBeUndefined();
  });

  it('skips rows without an NI order UUID and fetches others once (maxAttempts 1)', async () => {
    const { service, repo, logger } = makeService();
    repo.findStalePendingPayments.mockResolvedValue([
      { id: 'p-no-ref', orderId: 'SFAT-ABC-123', transactionId: null },
      { id: 'p-dev', orderId: 'FTR-1', transactionId: 'DEV-FTR-1' },
      { id: 'p-ni', orderId: 'SFAT-DEF-456', transactionId: NI_UUID },
    ]);
    repo.findPaymentByIdFull.mockResolvedValue({
      id: 'p-ni',
      status: 'pending',
      orderId: 'SFAT-DEF-456',
      transactionId: NI_UUID,
    });
    mockedFetchNi.mockResolvedValue({
      order: { state: 'STARTED' },
      state: 'STARTED',
    });

    await runAutoSync(service);

    expect(mockedFetchNi).toHaveBeenCalledTimes(1);
    expect(mockedFetchNi).toHaveBeenCalledWith(NI_UUID, expect.any(Function), {
      maxAttempts: 1,
    });
    expect(repo.findPaymentByIdFull).toHaveBeenCalledTimes(1);
    const warnMsgs = logger.warn.mock.calls.map((c) => c[1]);
    expect(warnMsgs).not.toContain(
      'Cannot sync payment — no NI UUID (internal merchant ref only)',
    );
  });

  it('logs an NI 404 as a warning (no error, no Sentry) and keeps going', async () => {
    const { service, repo, logger } = makeService();
    repo.findStalePendingPayments.mockResolvedValue([
      { id: 'p-404', orderId: 'PIN-1', transactionId: NI_UUID },
      { id: 'p-ok', orderId: 'PIN-2', transactionId: NI_UUID_2 },
    ]);
    repo.findPaymentByIdFull.mockImplementation(async (id: string) => ({
      id,
      status: 'pending',
      orderId: id === 'p-404' ? 'PIN-1' : 'PIN-2',
      transactionId: id === 'p-404' ? NI_UUID : NI_UUID_2,
    }));
    mockedFetchNi.mockImplementation(async (ref: string) => {
      if (ref === NI_UUID) {
        throw new NiGatewayError(
          'NI order fetch failed (404)',
          'fetch_order',
          404,
        );
      }
      return { order: { state: 'STARTED' }, state: 'STARTED' };
    });

    await runAutoSync(service);

    expect(mockedFetchNi).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'p-404' }),
      'NI auto-sync: order not found (404) — skipped',
    );
    expect(logger.error).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('still reports non-404 NI errors during auto-sync', async () => {
    const { service, repo, logger } = makeService();
    repo.findStalePendingPayments.mockResolvedValue([
      { id: 'p-500', orderId: 'PIN-1', transactionId: NI_UUID },
    ]);
    repo.findPaymentByIdFull.mockResolvedValue({
      id: 'p-500',
      status: 'pending',
      orderId: 'PIN-1',
      transactionId: NI_UUID,
    });
    mockedFetchNi.mockRejectedValue(
      new NiGatewayError('NI order fetch failed (500)', 'fetch_order', 500),
    );

    await runAutoSync(service);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'p-500' }),
      'NI sync API error',
    );
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('maps a fetched FAILED order exactly as before (marks failed)', async () => {
    const { service, repo, notifications } = makeService();
    repo.findStalePendingPayments.mockResolvedValue([
      { id: 'p-f', orderId: 'PIN-1', transactionId: NI_UUID },
    ]);
    repo.findPaymentByIdFull.mockResolvedValue({
      id: 'p-f',
      userId: 'u1',
      status: 'pending',
      orderId: 'PIN-1',
      transactionId: NI_UUID,
      metadata: {},
    });
    mockedFetchNi.mockResolvedValue({
      order: { state: 'FAILED' },
      state: 'FAILED',
    });

    await runAutoSync(service);

    expect(repo.markPaymentFailedById).toHaveBeenCalledWith('p-f');
    expect(notifications.notifyUser).toHaveBeenCalledTimes(1);
  });

  it('user-initiated sync keeps the default polling and still errors on 404', async () => {
    const { service, repo, logger } = makeService();
    const payment = {
      id: 'p-user',
      status: 'pending',
      orderId: 'PIN-1',
      transactionId: NI_UUID,
    };
    repo.findPaymentOwnedByUser.mockResolvedValue(payment);
    repo.findPaymentByIdFull.mockResolvedValue(payment);
    mockedFetchNi.mockRejectedValue(
      new NiGatewayError('NI order fetch failed (404)', 'fetch_order', 404),
    );

    await expect(
      service.syncPayment({ userId: 'u1', role: 'USER' } as never, 'p-user'),
    ).rejects.toBeDefined();
    expect(mockedFetchNi).toHaveBeenCalledWith(
      NI_UUID,
      expect.any(Function),
      undefined,
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'p-user' }),
      'NI sync API error',
    );
  });
});

describe('NI webhook fixed-header auth', () => {
  const SECRET = 'f9K@82nNc%P!r4QwLxTzA#10UvM&b6Xe';
  const prev = {
    secret: process.env.NI_WEBHOOK_SECRET,
    header: process.env.NI_WEBHOOK_HEADER,
    env: process.env.NODE_ENV,
  };
  const body = '{"eventName":"PURCHASED","order":{"reference":"x"}}';
  const hmac = crypto.createHmac('sha256', SECRET).update(body).digest('hex');

  beforeEach(() => {
    process.env.NI_WEBHOOK_SECRET = SECRET;
    delete process.env.NI_WEBHOOK_HEADER;
    process.env.NODE_ENV = 'production';
  });
  afterAll(() => {
    for (const [k, v] of [
      ['NI_WEBHOOK_SECRET', prev.secret],
      ['NI_WEBHOOK_HEADER', prev.header],
      ['NODE_ENV', prev.env],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('accepts the correct fixed header value', () => {
    const { service } = makeService();
    expect(service.verifyWebhookSignature(body, undefined, SECRET)).toEqual({
      ok: true,
    });
  });

  it('rejects a wrong value of the same length', () => {
    const { service, logger } = makeService();
    const wrong = SECRET.slice(0, -1) + (SECRET.endsWith('e') ? 'f' : 'e');
    expect(service.verifyWebhookSignature(body, undefined, wrong)).toEqual({
      ok: false,
      status: 401,
      error: 'invalid_signature',
    });
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).not.toContain(wrong);
    expect(logged).not.toContain(SECRET);
  });

  it('rejects a value of a different length', () => {
    const { service } = makeService();
    expect(
      service.verifyWebhookSignature(body, undefined, SECRET + 'x'),
    ).toMatchObject({ ok: false, status: 401 });
    expect(
      service.verifyWebhookSignature(body, undefined, 'short'),
    ).toMatchObject({ ok: false, status: 401 });
  });

  it('rejects a missing header in production', () => {
    const { service } = makeService();
    expect(service.verifyWebhookSignature(body, undefined, undefined)).toEqual({
      ok: false,
      status: 401,
      error: 'missing_signature',
    });
  });

  it('keeps accepting a valid HMAC x-signature (fallback)', () => {
    const { service } = makeService();
    expect(service.verifyWebhookSignature(body, hmac)).toEqual({ ok: true });
    expect(service.verifyWebhookSignature(body, `sha256=${hmac}`)).toEqual({
      ok: true,
    });
    expect(service.verifyWebhookSignature(body, 'deadbeef')).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it('falls back to HMAC when the fixed header is wrong but HMAC is valid', () => {
    const { service } = makeService();
    expect(service.verifyWebhookSignature(body, hmac, 'wrong')).toEqual({
      ok: true,
    });
  });

  it('rejects when no secret is configured in production', () => {
    delete process.env.NI_WEBHOOK_SECRET;
    const { service } = makeService();
    expect(service.verifyWebhookSignature(body, undefined, SECRET)).toEqual({
      ok: false,
      status: 401,
      error: 'missing_signature',
    });
  });

  it('header helpers: default name, env override, constant-time compare', () => {
    expect(niWebhookHeaderName()).toBe(DEFAULT_NI_WEBHOOK_HEADER);
    expect(DEFAULT_NI_WEBHOOK_HEADER).toBe('x-sarh-webhook-secret');
    expect(
      readNiWebhookFixedHeader({
        headers: { 'x-sarh-webhook-secret': SECRET },
      }),
    ).toBe(SECRET);
    process.env.NI_WEBHOOK_HEADER = 'X-Webhook-Secret';
    expect(niWebhookHeaderName()).toBe('x-webhook-secret');
    expect(
      readNiWebhookFixedHeader({ headers: { 'x-webhook-secret': [SECRET] } }),
    ).toBe(SECRET);
    expect(readNiWebhookFixedHeader({})).toBeUndefined();
    expect(niFixedSecretMatches(SECRET, SECRET)).toBe(true);
    expect(niFixedSecretMatches('', SECRET)).toBe(false);
    expect(niFixedSecretMatches(SECRET, '')).toBe(false);
  });
});
