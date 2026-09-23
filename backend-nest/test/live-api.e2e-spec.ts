/**
 * LIVE API E2E — hits the real Nest server (default http://127.0.0.1:3001).
 * Skips automatically if the API is unreachable.
 *
 * Credentials: ADMIN_E2E_LOGIN / ADMIN_E2E_PASSWORD (defaults: e2e_admin / E2eAdmin!234)
 */
import request from 'supertest';

const API = process.env.LIVE_API_URL ?? 'http://127.0.0.1:3001';
const ADMIN_LOGIN = process.env.ADMIN_E2E_LOGIN ?? 'e2e_admin';
const ADMIN_PASSWORD = process.env.ADMIN_E2E_PASSWORD ?? 'E2eAdmin!234';

async function apiReachable(): Promise<boolean> {
  try {
    const res = await request(API).get('/api/health').timeout(5000);
    return res.status === 200;
  } catch {
    return false;
  }
}

describe('LIVE API journeys (real backend)', () => {
  let live = false;
  let adminToken = '';

  beforeAll(async () => {
    live = await apiReachable();
    if (!live) {
      console.warn(
        `[live-e2e] API not reachable at ${API} — skipping live suite`,
      );
    }
  });

  const itLive = (name: string, fn: () => Promise<void>) =>
    it(name, async () => {
      if (!live) return;
      await fn();
    });

  itLive('health reports ok + db', async () => {
    const res = await request(API).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status ?? res.body.data?.status).toBeDefined();
  });

  itLive('public listings feed returns items', async () => {
    const res = await request(API)
      .get('/api/listings')
      .query({ page: 1, pageSize: 5 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data?.listings)).toBe(true);
    expect(res.body.data.listings.length).toBeGreaterThan(0);
  });

  itLive('public posts feed returns items', async () => {
    const res = await request(API)
      .get('/api/posts')
      .query({ page: 1, pageSize: 5 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data?.posts)).toBe(true);
  });

  itLive(
    'public plans catalog is available (payment/subscription)',
    async () => {
      const res = await request(API).get('/api/plans');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    },
  );

  itLive('admin login with e2e credentials', async () => {
    const res = await request(API)
      .post('/api/admin/auth/login')
      .send({ login: ADMIN_LOGIN, password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.role).toMatch(/ADMIN|MODERATOR/);
    adminToken = res.body.data.accessToken;
  });

  itLive('admin me + dashboard stats', async () => {
    expect(adminToken).toBeTruthy();
    const me = await request(API)
      .get('/api/admin/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.username).toBeTruthy();

    const stats = await request(API)
      .get('/api/admin/dashboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(stats.status).toBe(200);
    expect(stats.body.data.users.total).toBeGreaterThanOrEqual(0);
    expect(stats.body.data.listings.total).toBeGreaterThanOrEqual(0);
  });

  itLive('admin can list users, posts, listings, orders, plans', async () => {
    expect(adminToken).toBeTruthy();
    const auth = { Authorization: `Bearer ${adminToken}` };

    const users = await request(API)
      .get('/api/admin/users')
      .set(auth)
      .query({ page: 1, pageSize: 10 });
    expect(users.status).toBe(200);
    expect(users.body.data.items.length).toBeGreaterThan(0);

    const posts = await request(API)
      .get('/api/admin/posts')
      .set(auth)
      .query({ page: 1 });
    expect(posts.status).toBe(200);

    const listings = await request(API)
      .get('/api/admin/listings')
      .set(auth)
      .query({ page: 1 });
    expect(listings.status).toBe(200);

    const orders = await request(API)
      .get('/api/admin/orders')
      .set(auth)
      .query({ page: 1 });
    expect(orders.status).toBe(200);

    const plans = await request(API).get('/api/admin/plans').set(auth);
    expect(plans.status).toBe(200);
  });

  itLive('admin support tickets + butchers + applications', async () => {
    expect(adminToken).toBeTruthy();
    const auth = { Authorization: `Bearer ${adminToken}` };

    const tickets = await request(API)
      .get('/api/admin/support/tickets')
      .set(auth);
    expect(tickets.status).toBe(200);

    const butchers = await request(API)
      .get('/api/admin/butchers')
      .set(auth)
      .query({ page: 1 });
    expect(butchers.status).toBe(200);

    const apps = await request(API)
      .get('/api/admin/butcher-applications')
      .set(auth);
    expect(apps.status).toBe(200);
  });

  itLive('admin editorial stories + official services + settings', async () => {
    expect(adminToken).toBeTruthy();
    const auth = { Authorization: `Bearer ${adminToken}` };

    const stories = await request(API)
      .get('/api/admin/editorial-stories')
      .set(auth);
    expect(stories.status).toBe(200);

    const services = await request(API).get('/api/admin/services').set(auth);
    expect(services.status).toBe(200);

    const settings = await request(API).get('/api/admin/settings').set(auth);
    expect(settings.status).toBe(200);
  });

  itLive('promote pricing plans + quote path (ads payment)', async () => {
    const plans = await request(API).get('/api/listings/promotion/plans');
    expect(plans.status).toBe(200);
    expect(plans.body.success).toBe(true);
    expect(
      Array.isArray(plans.body.data?.tiers) || plans.body.data,
    ).toBeTruthy();

    const quote = await request(API)
      .get('/api/listings/promote/quote')
      .query({ goal: 'visibility', durationHours: 24 });
    // May require listingId — accept 200 or validation 400, never 5xx
    expect([200, 400]).toContain(quote.status);
  });
});
