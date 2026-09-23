/**
 * §21 Network/API error codes, §23 Permissions/security, §25 Edge cases — LIVE E2E.
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

describe('§21/§23/§25 Error codes, permissions, and edge cases', () => {
  let live = false;
  let user: TestUser;

  beforeAll(async () => {
    live = await apiReachable();
    if (!live) return;
    user = await registerUser('e2e_sec');
  });

  const t = (name: string, fn: () => Promise<void>) =>
    it(name, async () => {
      if (!live) return;
      await fn();
    });

  // ── §21 Standard error codes ────────────────────────────────
  t('400 on invalid body (validation)', async () => {
    const res = await request(API)
      .post('/api/listings')
      .set(authHeader(user.accessToken))
      .send({ price: 'not-a-number' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  t('401 without authentication', async () => {
    const res = await request(API).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  t('403 when a normal user hits an admin-only route', async () => {
    const res = await request(API)
      .get('/api/admin/users')
      .set(authHeader(user.accessToken));
    expect(res.status).toBe(403);
  });

  t('404 for unknown resource', async () => {
    const res = await request(API).get(
      '/api/listings/00000000-0000-0000-0000-000000000000',
    );
    expect(res.status).toBe(404);
  });

  t('404 for unknown route path', async () => {
    const res = await request(API).get('/api/this-route-does-not-exist');
    expect(res.status).toBe(404);
  });

  t('health endpoint responds (network up)', async () => {
    const res = await request(API).get('/api/health');
    expect([200, 503]).toContain(res.status);
  });

  // ── §23 Permissions / security ──────────────────────────────
  t('normal user cannot list admin dashboard stats → 403', async () => {
    const res = await request(API)
      .get('/api/admin/dashboard/stats')
      .set(authHeader(user.accessToken));
    expect(res.status).toBe(403);
  });

  t('normal user cannot access admin listings → 403', async () => {
    const res = await request(API)
      .get('/api/admin/listings')
      .set(authHeader(user.accessToken));
    expect(res.status).toBe(403);
  });

  t('admin login endpoint rejects normal user credentials', async () => {
    const res = await request(API)
      .post('/api/admin/auth/login')
      .send({ login: user.username, password: user.password });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  t(
    'cannot access another users blocked list without being them (own only)',
    async () => {
      // blocked list is self-scoped; unauth → 401
      const res = await request(API).get('/api/users/blocked');
      expect(res.status).toBe(401);
    },
  );

  // ── §25 Edge cases in create listing ────────────────────────
  t('empty strings rejected', async () => {
    const res = await request(API)
      .post('/api/listings')
      .set(authHeader(user.accessToken))
      .send(sampleListing({ title: '', arabicTitle: '' }));
    expect(res.status).toBe(400);
  });

  t('excessively long title rejected (>100 chars)', async () => {
    const res = await request(API)
      .post('/api/listings')
      .set(authHeader(user.accessToken))
      .send(sampleListing({ title: 'a'.repeat(300) }));
    expect(res.status).toBe(400);
  });

  t('zero price rejected', async () => {
    const res = await request(API)
      .post('/api/listings')
      .set(authHeader(user.accessToken))
      .send(sampleListing({ price: 0 }));
    expect(res.status).toBe(400);
  });

  t(
    'emoji + mixed Arabic/English content accepted in valid listing',
    async () => {
      const res = await request(API)
        .post('/api/listings')
        .set(authHeader(user.accessToken))
        .send(
          sampleListing({
            title: 'Camel 🐪 Premium',
            arabicTitle: 'جمل ممتاز 🐪 Premium',
            description:
              'Mixed عربي and English content 123 for the E2E edge test.',
            arabicDescription:
              'محتوى مختلط عربي English وأرقام ١٢٣ لاختبار الحواف.',
          }),
        );
      expect([200, 201]).toContain(res.status);
      const id = res.body?.data?.id ?? res.body?.data?.listing?.id;
      if (id) {
        await request(API)
          .delete(`/api/listings/${id}`)
          .set(authHeader(user.accessToken));
      }
    },
  );

  t('special characters in search do not crash the API', async () => {
    const res = await request(API)
      .get('/api/listings')
      .query({ search: "'; DROP TABLE users;--" });
    expect(res.status).toBeLessThan(500);
  });

  t('extremely large price rejected (> max)', async () => {
    const res = await request(API)
      .post('/api/listings')
      .set(authHeader(user.accessToken))
      .send(sampleListing({ price: 99_000_000_000 }));
    expect(res.status).toBe(400);
  });

  t('too many images rejected (> 8)', async () => {
    const many = Array.from(
      { length: 12 },
      (_, i) => `https://cdn.sarh.app/e2e/${i}.jpg`,
    );
    const res = await request(API)
      .post('/api/listings')
      .set(authHeader(user.accessToken))
      .send(sampleListing({ images: many }));
    expect(res.status).toBe(400);
  });

  // ── §17 Account deletion (settings → account info) ──────────
  t('user cannot delete another account (403)', async () => {
    const victim = await registerUser('e2e_victim');
    const res = await request(API)
      .delete(`/api/users/${victim.id}`)
      .set(authHeader(user.accessToken));
    expect(res.status).toBe(403);
  });

  t('user can delete their own account and can no longer log in', async () => {
    const doomed = await registerUser('e2e_selfdel');
    const del = await request(API)
      .delete(`/api/users/${doomed.id}`)
      .set(authHeader(doomed.accessToken));
    expect([200, 204]).toContain(del.status);

    const login = await request(API)
      .post('/api/auth/login')
      .send({ login: doomed.username, password: doomed.password });
    expect(login.status).toBe(401);
  });
});
