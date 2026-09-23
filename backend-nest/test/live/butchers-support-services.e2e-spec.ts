/**
 * §12 Butchers, §18 Support/Help, §19 Sarh services — LIVE E2E.
 */
import request from 'supertest';
import {
  API,
  apiReachable,
  authHeader,
  registerUser,
  type TestUser,
} from './helpers';

describe('§12/§18/§19 Butchers, Support, Sarh services', () => {
  let live = false;
  let user: TestUser;
  let butcherId = '';

  beforeAll(async () => {
    live = await apiReachable();
    if (!live) return;
    user = await registerUser('e2e_butcher');
  });

  const t = (name: string, fn: () => Promise<void>) =>
    it(name, async () => {
      if (!live) return;
      await fn();
    });

  // ── Butchers directory (§12) ────────────────────────────────
  t('butchers list is available', async () => {
    const res = await request(API).get('/api/butchers');
    expect(res.status).toBe(200);
    const list = res.body.data.butchers ?? res.body.data.items ?? res.body.data;
    expect(Array.isArray(list)).toBe(true);
    if (Array.isArray(list) && list[0]) butcherId = list[0].id;
  });

  t('butchers search + filter query works', async () => {
    const res = await request(API)
      .get('/api/butchers')
      .query({ search: 'ملحمة', country: 'SA' });
    expect(res.status).toBe(200);
  });

  t('butcher detail (if any exists)', async () => {
    if (!butcherId) return;
    const res = await request(API).get(`/api/butchers/${butcherId}`);
    expect(res.status).toBe(200);
  });

  t('butcher reviews list (if any exists)', async () => {
    if (!butcherId) return;
    const res = await request(API).get(`/api/butchers/${butcherId}/reviews`);
    expect(res.status).toBe(200);
  });

  t('butcher products need a butcherId query', async () => {
    const res = await request(API).get('/api/butchers/products');
    // Required query missing → 400; with a real id → 200
    expect([400, 200]).toContain(res.status);
    if (butcherId) {
      const ok = await request(API)
        .get('/api/butchers/products')
        .query({ butcherId });
      expect(ok.status).toBe(200);
    }
  });

  t('my butcher orders list (auth)', async () => {
    const res = await request(API)
      .get('/api/butchers/orders')
      .set(authHeader(user.accessToken));
    expect(res.status).toBe(200);
  });

  // ── Butcher applications (§12) ──────────────────────────────
  t('butcher applications list requires auth', async () => {
    const unauth = await request(API).get('/api/butcher-applications');
    expect(unauth.status).toBe(401);

    const res = await request(API)
      .get('/api/butcher-applications')
      .set(authHeader(user.accessToken));
    expect(res.status).toBe(200);
  });

  // ── Support / Help (§18) ────────────────────────────────────
  t('support meta + public FAQs', async () => {
    const meta = await request(API).get('/api/support/meta');
    expect(meta.status).toBe(200);
    expect(meta.body.success).toBe(true);
    expect(meta.body.data?.tickets?.categories?.length).toBeGreaterThan(0);
    const faqs = await request(API).get('/api/support/faqs');
    expect(faqs.status).toBe(200);
    expect(faqs.body.success).toBe(true);
    expect(
      Array.isArray(faqs.body.data?.faqs ?? faqs.body.data?.items ?? []),
    ).toBe(true);
  });

  t('create a support ticket, list it, and reply', async () => {
    const create = await request(API)
      .post('/api/support/tickets')
      .set(authHeader(user.accessToken))
      .send({
        category: 'technical',
        subject: 'مشكلة اختبار E2E',
        description: 'وصف تفصيلي لمشكلة اختبار آلي في التطبيق.',
      });
    expect([200, 201, 400]).toContain(create.status);
    if (create.status >= 200 && create.status < 300) {
      expect(create.body.success).toBe(true);
      const ticketId = create.body.data?.ticket?.id ?? create.body.data?.id;
      expect(ticketId).toBeTruthy();
      const list = await request(API)
        .get('/api/support/tickets')
        .set(authHeader(user.accessToken));
      expect(list.status).toBe(200);
      expect(list.body.success).toBe(true);
      expect(Array.isArray(list.body.data?.items)).toBe(true);
      if (ticketId) {
        const detail = await request(API)
          .get(`/api/support/tickets/${ticketId}`)
          .set(authHeader(user.accessToken));
        expect(detail.status).toBe(200);
        expect(detail.body.data?.ticket?.id).toBe(ticketId);

        const reply = await request(API)
          .post(`/api/support/tickets/${ticketId}/messages`)
          .set(authHeader(user.accessToken))
          .send({ body: 'رسالة رد اختبار' });
        expect([200, 201]).toContain(reply.status);
        expect(reply.body.success).toBe(true);
      }
    }
  });

  t('support ticket creation requires auth → 401', async () => {
    const res = await request(API)
      .post('/api/support/tickets')
      .send({ category: 'technical', subject: 'x', description: 'y' });
    expect(res.status).toBe(401);
  });

  t('verification request endpoint (auth)', async () => {
    const res = await request(API)
      .get('/api/support/verification')
      .set(authHeader(user.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.request).toBeTruthy();
  });

  // ── Sarh official services (§19) ────────────────────────────
  t('official services list is public', async () => {
    const res = await request(API).get('/api/services');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.services)).toBe(true);
  });
});
