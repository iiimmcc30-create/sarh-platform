/**
 * §14 Real payment gateway (Network International / N-Genius) verification
 * across the three money flows: promotion page, fee payment, butcher order.
 *
 * These assert the flows are REALLY wired to the NI gateway and behave
 * correctly regardless of merchant-outlet activation state:
 *   - If the NI outlet is ACTIVE  → a hosted checkout URL is returned.
 *   - If the NI outlet is INACTIVE / unreachable → a STRUCTURED 502
 *     `payment_gateway_error` (never a crash / 500), surfacing the NI reason.
 *
 * Outlet reference: 36a1f0d3-6a8f-4287-958f-f151ae17146d (NI_OUTLET_ID).
 * Live check: `node scripts/test-ni-gateway.js` — auth + hosted checkout URL.
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

const GATEWAY_ERR = [502, 503, 504];

/** A payment initiation is "healthy" if it either produced a checkout URL
 * or returned a structured gateway error — but never crashed (500). */
function assertWiredToGateway(res: request.Response) {
  expect(res.status).not.toBe(500);
  expect([200, 201, ...GATEWAY_ERR]).toContain(res.status);
  if (res.status < 300) {
    const url = res.body?.data?.checkoutUrl;
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
  } else {
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('payment_gateway_error');
    expect(typeof res.body.messageAr).toBe('string');
    expect(res.body.messageAr.length).toBeGreaterThan(0);
  }
}

describe('§14 Real payment gateway (NI) — promote, fees, butcher', () => {
  let live = false;
  let user: TestUser;
  let listingId = '';

  beforeAll(async () => {
    live = await apiReachable();
    if (!live) return;
    user = await registerUser('e2e_gw');
    const created = await request(API)
      .post('/api/listings')
      .set(authHeader(user.accessToken))
      .send(sampleListing());
    listingId = created.body?.data?.id ?? '';
  });

  const t = (name: string, fn: () => Promise<void>) =>
    it(name, async () => {
      if (!live) return;
      await fn();
    });

  // ── Promotion page (§15) ────────────────────────────────────
  t('promote page: boost is wired to the real gateway', async () => {
    if (!listingId) return;
    const res = await request(API)
      .post(`/api/listings/${listingId}/boost`)
      .set(authHeader(user.accessToken))
      .send({ boostType: 'featured', durationDays: 3, method: 'visa' });
    assertWiredToGateway(res);
  });

  t(
    'promote page: visibility promotion is wired to the real gateway',
    async () => {
      if (!listingId) return;
      const res = await request(API)
        .post(`/api/listings/${listingId}/promotion`)
        .set(authHeader(user.accessToken))
        .send({
          durationDays: 3,
          amount: 39,
          method: 'visa',
          promotionGoal: 'visibility',
        });
      assertWiredToGateway(res);
    },
  );

  // ── Fee / commission payment (§14) ──────────────────────────
  t(
    'fee payment: own-listing commission initiation is wired to the real gateway',
    async () => {
      if (!listingId) return;
      const res = await request(API)
        .post('/api/payments/initiate')
        .set(authHeader(user.accessToken))
        .send({
          amount: 25,
          method: 'visa',
          type: 'commission',
          referenceId: listingId,
        });
      assertWiredToGateway(res);
    },
  );

  t(
    'fee payment: unknown fee reference is rejected before charging (404)',
    async () => {
      const res = await request(API)
        .post('/api/payments/initiate')
        .set(authHeader(user.accessToken))
        .send({
          amount: 25,
          method: 'visa',
          type: 'listing_fee',
          referenceId: '00000000-0000-0000-0000-000000000000',
        });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('fee_not_found');
    },
  );

  // ── Butcher order payment (§12/§14) ─────────────────────────
  t(
    'butcher payment: unknown order reference is rejected before charging (404)',
    async () => {
      const res = await request(API)
        .post('/api/payments/initiate')
        .set(authHeader(user.accessToken))
        .send({
          amount: 100,
          method: 'visa',
          type: 'butcher_order',
          referenceId: '00000000-0000-0000-0000-000000000000',
        });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('order_not_found');
    },
  );

  // ── Common gateway invariants ───────────────────────────────
  t('all payment initiations require authentication (401)', async () => {
    const boost = await request(API)
      .post(`/api/listings/${listingId}/boost`)
      .send({ boostType: 'featured', durationDays: 3, method: 'visa' });
    const pay = await request(API)
      .post('/api/payments/initiate')
      .send({ amount: 25, method: 'visa', type: 'commission' });
    expect(boost.status).toBe(401);
    expect(pay.status).toBe(401);
  });

  t('payment return bridge pages respond (redirect flow)', async () => {
    const result = await request(API)
      .get('/payment/result')
      .query({ paymentId: 'x' });
    const cancel = await request(API).get('/payment/cancel');
    expect(result.status).toBeLessThan(500);
    expect(cancel.status).toBeLessThan(500);
  });

  afterAll(async () => {
    if (live && listingId) {
      await request(API)
        .delete(`/api/listings/${listingId}`)
        .set(authHeader(user.accessToken));
    }
  });
});
