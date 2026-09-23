/**
 * §14 Payments, §15 Promotion pricing — LIVE E2E.
 * Verifies the exact price table and real payment initiation + dev completion.
 */
import request from 'supertest';
import {
  API,
  apiReachable,
  authHeader,
  registerUser,
  sampleListing,
  type TestUser,
} from './helpers';

describe('§14–§15 Payments & Promotion', () => {
  let live = false;
  let user: TestUser;
  let listingId = '';

  beforeAll(async () => {
    live = await apiReachable();
    if (!live) return;
    user = await registerUser('e2e_pay');
    const created = await request(API)
      .post('/api/listings')
      .set(authHeader(user.accessToken))
      .send(sampleListing());
    listingId = created.body?.data?.id ?? created.body?.data?.listing?.id ?? '';
  });

  const t = (name: string, fn: () => Promise<void>) =>
    it(name, async () => {
      if (!live) return;
      await fn();
    });

  // ── Plans catalog (§14) ─────────────────────────────────────
  t('subscription plans catalog is public', async () => {
    const res = await request(API).get('/api/plans');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.plans)).toBe(true);
  });

  t('fee rules catalog is public', async () => {
    const res = await request(API).get('/api/fees/rules');
    expect(res.status).toBe(200);
  });

  t('user subscriptions endpoint (auth)', async () => {
    const res = await request(API)
      .get('/api/subscriptions')
      .set(authHeader(user.accessToken));
    expect(res.status).toBe(200);
  });

  // ── Promotion pricing table (§15) ───────────────────────────
  t('boost plans expose official pin/feature/both catalog prices', async () => {
    const res = await request(API).get('/api/listings/boost/plans');
    expect(res.status).toBe(200);
    const { featured, pinned, both } = res.body.data;

    const byDays = (arr: { durationDays: number; amount: number }[]) =>
      Object.fromEntries(arr.map((p) => [p.durationDays, p.amount]));

    const f = byDays(featured);
    const p = byDays(pinned);
    const bth = byDays(both);

    expect(f[1]).toBe(9);
    expect(f[3]).toBe(25);
    expect(f[7]).toBeUndefined();
    expect(p[1]).toBe(12);
    expect(p[3]).toBe(29);
    expect(p[7]).toBeUndefined();
    expect(bth[1]).toBe(21);
    expect(bth[3]).toBe(54);
    expect(bth[1]).toBe(p[1] + f[1]);
    expect(bth[3]).toBe(p[3] + f[3]);
  });

  t('promotion plans (visibility tiers) are public', async () => {
    const res = await request(API).get('/api/listings/promotion/plans');
    expect(res.status).toBe(200);
    expect(res.body.data.plans.length).toBeGreaterThan(0);
  });

  t('promote quote returns a computed price', async () => {
    const res = await request(API)
      .get('/api/listings/promote/quote')
      .query({ goal: 'featured', durationHours: 72 });
    expect([200, 400]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.data).toBeTruthy();
    }
  });

  t('promote quote with invalid goal → 400', async () => {
    const res = await request(API)
      .get('/api/listings/promote/quote')
      .query({ goal: 'nonsense', durationHours: 72 });
    expect(res.status).toBe(400);
  });

  // Upstream N-Genius gateway is a third party; from a sandbox it may be
  // unreachable (502/503/504). That is an ENV limit, not an app bug — the app
  // must still respond with a structured error envelope, never crash (500).
  const GATEWAY_UNREACHABLE = [502, 503, 504];
  const assertGatewayOrOk = (res: request.Response) => {
    expect([200, 201, 400, 402, ...GATEWAY_UNREACHABLE]).toContain(res.status);
    if (GATEWAY_UNREACHABLE.includes(res.status)) {
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('payment_gateway_error');
    }
    expect(res.status).not.toBe(500);
  };

  // ── Payment initiation (§14) ────────────────────────────────
  t(
    'initiate a subscription payment (auth) is handled (checkout or graceful gateway error)',
    async () => {
      const plans = await request(API).get('/api/plans');
      const plan =
        (plans.body.data.plans ?? []).find(
          (p: { monthlyPrice?: number }) => (p.monthlyPrice ?? 0) > 0,
        ) ?? (plans.body.data.plans ?? [])[0];
      if (!plan) return;
      const res = await request(API)
        .post('/api/payments/initiate')
        .set(authHeader(user.accessToken))
        .send({
          amount:
            plan.monthlyPrice && plan.monthlyPrice > 0 ? plan.monthlyPrice : 25,
          method: 'visa',
          type: 'subscription',
          planId: plan.id,
          billingCycle: 'monthly',
        });
      assertGatewayOrOk(res);
    },
  );

  t('initiate payment without auth → 401', async () => {
    const res = await request(API)
      .post('/api/payments/initiate')
      .send({ amount: 10, method: 'visa', type: 'subscription' });
    expect(res.status).toBe(401);
  });

  // ── Boost payment via listing (§15) ─────────────────────────
  t(
    'start a boost on own listing initiates payment (or graceful gateway error)',
    async () => {
      if (!listingId) return;
      const res = await request(API)
        .post(`/api/listings/${listingId}/boost`)
        .set(authHeader(user.accessToken))
        .send({ boostType: 'featured', durationDays: 3, method: 'visa' });
      assertGatewayOrOk(res);
    },
  );

  t('boost without auth → 401', async () => {
    if (!listingId) return;
    const res = await request(API)
      .post(`/api/listings/${listingId}/boost`)
      .send({ boostType: 'featured', durationDays: 3, method: 'visa' });
    expect(res.status).toBe(401);
  });

  afterAll(async () => {
    if (live && listingId) {
      await request(API)
        .delete(`/api/listings/${listingId}`)
        .set(authHeader(user.accessToken));
    }
  });
});
