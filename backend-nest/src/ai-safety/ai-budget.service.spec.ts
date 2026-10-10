import IORedis from 'ioredis';
import {
  AI_BUDGET_KEYS,
  AiBudgetService,
  riyadhDay,
  type AiBudgetRedis,
} from './ai-budget.service';

const logger = { warn: jest.fn(), info: jest.fn() } as never;

/**
 * In-process stand-in for Redis that executes the reservation script the way
 * Redis does: one script at a time, atomically, against shared counters —
 * including an artificial await before each command so callers interleave.
 */
function fakeRedis(): AiBudgetRedis & { store: Map<string, number> } {
  const store = new Map<string, number>();
  let chain = Promise.resolve<unknown>(undefined);
  return {
    store,
    status: 'ready',
    eval: ((
      _script: string,
      nKeys: number,
      ...rest: string[]
    ) => {
      const run = async () => {
        await new Promise((r) => setImmediate(r));
        const keys = rest.slice(0, nKeys);
        const args = rest.slice(nKeys);
        const [stKey, srKey, ftKey, frKey] = keys;
        const amount = Number(args[0]);
        const sharedTokenLimit = Number(args[1]);
        const sharedReqLimit = Number(args[2]);
        const featureTokenLimit = Number(args[3]);
        const featureReqLimit = Number(args[4]);
        const st = store.get(stKey) ?? 0;
        const sr = store.get(srKey) ?? 0;
        const ft = store.get(ftKey) ?? 0;
        const fr = store.get(frKey) ?? 0;
        if (fr + 1 > featureReqLimit) return [0, 2];
        if (sr + 1 > sharedReqLimit) return [0, 2];
        if (ft + amount > featureTokenLimit) return [0, 1];
        if (st + amount > sharedTokenLimit) return [0, 1];
        store.set(stKey, st + amount);
        store.set(srKey, sr + 1);
        store.set(ftKey, ft + amount);
        store.set(frKey, fr + 1);
        return [1, 0];
      };
      const p = chain.then(run);
      chain = p.catch(() => undefined);
      return p;
    }) as never,
    incrby: (async (key: string, by: number) => {
      store.set(key, (store.get(key) ?? 0) + Number(by));
      return store.get(key);
    }) as never,
    mget: (async (...keys: string[]) =>
      keys.map((k) => (store.has(k) ? String(store.get(k)) : null))) as never,
  };
}

describe('AiBudgetService (shared daily budget)', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('uses the Asia/Riyadh calendar day', () => {
    // 2026-10-10 21:30Z is already 2026-10-11 00:30 in Riyadh.
    expect(riyadhDay(Date.UTC(2026, 9, 10, 21, 30))).toBe('2026-10-11');
    expect(riyadhDay(Date.UTC(2026, 9, 10, 20, 59))).toBe('2026-10-10');
  });

  it('reserves, then settles to the real usage', async () => {
    process.env.SARH_AI_DAILY_TOKEN_BUDGET = '1000';
    const redis = fakeRedis();
    const svc = new AiBudgetService(logger, redis);
    const r = await svc.reserve(600);
    expect(r.ok).toBe(true);
    await svc.settle(r, 250);
    const day = riyadhDay();
    expect(redis.store.get(AI_BUDGET_KEYS.tokens(day))).toBe(250);
    expect((await svc.reserve(700)).ok).toBe(true);
    const third = await svc.reserve(100);
    expect(third).toEqual({ ok: false, reason: 'tokens' });
  });

  it('keeps the reservation when usage is unknown and refunds on request', async () => {
    process.env.SARH_AI_DAILY_TOKEN_BUDGET = '1000';
    const redis = fakeRedis();
    const svc = new AiBudgetService(logger, redis);
    const day = riyadhDay();
    const a = await svc.reserve(300);
    await svc.settle(a, null);
    expect(redis.store.get(AI_BUDGET_KEYS.tokens(day))).toBe(300);
    const b = await svc.reserve(300);
    await svc.settle(b, null, { refund: true });
    expect(redis.store.get(AI_BUDGET_KEYS.tokens(day))).toBe(300);
  });

  it('enforces the daily request cap', async () => {
    process.env.SARH_AI_DAILY_REQUEST_LIMIT = '2';
    const svc = new AiBudgetService(logger, fakeRedis());
    expect((await svc.reserve(1)).ok).toBe(true);
    expect((await svc.reserve(1)).ok).toBe(true);
    expect(await svc.reserve(1)).toEqual({ ok: false, reason: 'requests' });
  });

  it('budget 0 blocks every call', async () => {
    process.env.SARH_AI_DAILY_TOKEN_BUDGET = '0';
    const svc = new AiBudgetService(logger, fakeRedis());
    expect(await svc.reserve(1)).toEqual({ ok: false, reason: 'tokens' });
  });

  it('concurrent reservations never exceed the budget (atomic script)', async () => {
    process.env.SARH_AI_DAILY_TOKEN_BUDGET = '10000';
    const redis = fakeRedis();
    const svc = new AiBudgetService(logger, redis);
    const results = await Promise.all(
      Array.from({ length: 50 }, () => svc.reserve(1000)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(10);
    expect(redis.store.get(AI_BUDGET_KEYS.tokens(riyadhDay()))).toBe(10000);
  });

  it('fails closed when Redis is enabled but not ready', async () => {
    const redis = { ...fakeRedis(), status: 'end' };
    const svc = new AiBudgetService(logger, redis);
    expect(await svc.reserve(10)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('fails closed when the script errors', async () => {
    const redis = fakeRedis();
    redis.eval = (async () => {
      throw new Error('boom');
    }) as never;
    const svc = new AiBudgetService(logger, redis);
    expect(await svc.reserve(10)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('assistant cap does not spend the summarizer cap, and the shared cap still binds', async () => {
    process.env.SARH_AI_DAILY_TOKEN_BUDGET = '10000';
    process.env.SARH_AI_DAILY_REQUEST_LIMIT = '100';
    process.env.SARH_AI_ASSISTANT_DAILY_TOKEN_BUDGET = '100';
    process.env.SARH_AI_SUMMARIZER_DAILY_TOKEN_BUDGET = '5000';
    const redis = fakeRedis();
    const svc = new AiBudgetService(logger, redis);
    const day = riyadhDay();
    expect((await svc.reserve(80, 'support_assistant')).ok).toBe(true);
    expect(await svc.reserve(80, 'support_assistant')).toEqual({
      ok: false,
      reason: 'tokens',
    });
    expect((await svc.reserve(200, 'knowledge_summarizer')).ok).toBe(true);
    expect(
      redis.store.get(AI_BUDGET_KEYS.featureTokens('support_assistant', day)),
    ).toBe(80);
    expect(
      redis.store.get(
        AI_BUDGET_KEYS.featureTokens('knowledge_summarizer', day),
      ),
    ).toBe(200);
    expect(redis.store.get(AI_BUDGET_KEYS.tokens(day))).toBe(280);

    process.env.SARH_AI_DAILY_TOKEN_BUDGET = '100';
    process.env.SARH_AI_ASSISTANT_DAILY_TOKEN_BUDGET = '10000';
    process.env.SARH_AI_SUMMARIZER_DAILY_TOKEN_BUDGET = '10000';
    const shared = fakeRedis();
    const limited = new AiBudgetService(logger, shared);
    expect((await limited.reserve(60, 'support_assistant')).ok).toBe(true);
    expect(await limited.reserve(60, 'knowledge_summarizer')).toEqual({
      ok: false,
      reason: 'tokens',
    });
    expect(
      shared.store.get(
        AI_BUDGET_KEYS.featureTokens('knowledge_summarizer', day),
      ),
    ).toBeUndefined();
  });

  it('settles and refunds the shared counter and the feature counter together', async () => {
    process.env.SARH_AI_DAILY_TOKEN_BUDGET = '1000';
    process.env.SARH_AI_ASSISTANT_DAILY_TOKEN_BUDGET = '1000';
    const redis = fakeRedis();
    const svc = new AiBudgetService(logger, redis);
    const day = riyadhDay();
    const held = await svc.reserve(300, 'support_assistant');
    await svc.settle(held, null, { refund: true });
    expect(redis.store.get(AI_BUDGET_KEYS.tokens(day))).toBe(0);
    expect(
      redis.store.get(AI_BUDGET_KEYS.featureTokens('support_assistant', day)),
    ).toBe(0);
    expect(
      redis.store.get(
        AI_BUDGET_KEYS.featureTokens('knowledge_summarizer', day),
      ),
    ).toBeUndefined();
  });

  it('REDIS_ENABLED=false (single-process dev) uses an in-memory counter', async () => {
    process.env.REDIS_ENABLED = 'false';
    process.env.SARH_AI_DAILY_TOKEN_BUDGET = '100';
    const svc = new AiBudgetService(logger);
    expect((await svc.reserve(60)).ok).toBe(true);
    expect(await svc.reserve(60)).toEqual({ ok: false, reason: 'tokens' });
    expect((await svc.usageToday()).tokens).toBe(60);
  });

  // Real Redis (runs the actual Lua script). Set AI_BUDGET_TEST_REDIS_URL to enable.
  const url = process.env.AI_BUDGET_TEST_REDIS_URL;
  (url ? describe : describe.skip)('against a real Redis', () => {
    let client: IORedis;
    beforeAll(async () => {
      client = new IORedis(url as string);
      await client.flushdb();
    });
    afterAll(async () => {
      await client.quit();
    });

    it('two "replicas" racing 100 reservations stay within budget', async () => {
      process.env.SARH_AI_DAILY_TOKEN_BUDGET = '5000';
      process.env.SARH_AI_DAILY_REQUEST_LIMIT = '1000';
      const second = new IORedis(url as string);
      await second.ping();
      const a = new AiBudgetService(logger, client as never);
      const b = new AiBudgetService(logger, second as never);
      const results = await Promise.all(
        Array.from({ length: 100 }, (_, i) => (i % 2 ? a : b).reserve(100)),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(50);
      // both replicas got some of the budget (no replica was locked out)
      expect(
        results.filter((r, i) => r.ok && i % 2 === 0).length,
      ).toBeGreaterThan(0);
      expect(
        results.filter((r, i) => r.ok && i % 2 === 1).length,
      ).toBeGreaterThan(0);
      const day = riyadhDay();
      expect(Number(await client.get(AI_BUDGET_KEYS.tokens(day)))).toBe(5000);
      expect(Number(await client.get(AI_BUDGET_KEYS.requests(day)))).toBe(50);
      expect(await client.ttl(AI_BUDGET_KEYS.tokens(day))).toBeGreaterThan(0);
      await second.quit();
    });
  });
});
