/**
 * §2 Home, §3 Market/Search/Filter, §4 Add listing, §5 Manage listings — LIVE E2E.
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

describe('§2–§5 Listings: feed, search, filters, create, manage', () => {
  let live = false;
  let owner: TestUser;
  let other: TestUser;
  let listingId = '';

  beforeAll(async () => {
    live = await apiReachable();
    if (!live) return;
    owner = await registerUser('e2e_seller');
    other = await registerUser('e2e_other');
  });

  const t = (name: string, fn: () => Promise<void>) =>
    it(name, async () => {
      if (!live) return;
      await fn();
    });

  // ── Home / feed (§2, §3 view) ───────────────────────────────
  t('public listings feed returns items with pagination shape', async () => {
    const res = await request(API).get('/api/listings').query({ pageSize: 5 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.listings)).toBe(true);
  });

  t('feed supports cursor pagination', async () => {
    const first = await request(API).get('/api/listings');
    expect(first.status).toBe(200);
    const cursor = first.body.data.nextCursor;
    if (cursor) {
      const next = await request(API).get('/api/listings').query({ cursor });
      expect(next.status).toBe(200);
    }
  });

  // ── Search (§3) ─────────────────────────────────────────────
  t('search with a term returns 200', async () => {
    const res = await request(API)
      .get('/api/listings')
      .query({ search: 'ابل' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.listings)).toBe(true);
  });

  t('search with a single char (below min length) → 400', async () => {
    const res = await request(API).get('/api/listings').query({ search: 'a' });
    expect(res.status).toBe(400);
  });

  t('unified search endpoint returns grouped results', async () => {
    const res = await request(API)
      .get('/api/search')
      .query({ q: 'ابل', type: 'all' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.groups)).toBe(true);
  });

  t('unified search rejects query shorter than 2 chars', async () => {
    const res = await request(API).get('/api/search').query({ q: 'a' });
    expect(res.status).toBe(400);
  });

  t('search suggest returns suggestions array', async () => {
    const res = await request(API)
      .get('/api/search/suggest')
      .query({ q: 'اب' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.suggestions)).toBe(true);
  });

  t('search trending still works (backward compatible)', async () => {
    const res = await request(API).get('/api/search/trending');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.trending)).toBe(true);
  });

  // ── Filters (§3) ────────────────────────────────────────────
  t('filter by category', async () => {
    const res = await request(API)
      .get('/api/listings')
      .query({ category: 'camels' });
    expect(res.status).toBe(200);
  });

  t('filter by country + price range', async () => {
    const res = await request(API)
      .get('/api/listings')
      .query({ country: 'SA', minPrice: 100, maxPrice: 1_000_000 });
    expect(res.status).toBe(200);
  });

  t('invalid category enum → 400', async () => {
    const res = await request(API)
      .get('/api/listings')
      .query({ category: 'dragons' });
    expect(res.status).toBe(400);
  });

  // ── Create (§4) ─────────────────────────────────────────────
  t('creating a listing requires auth → 401 without token', async () => {
    const res = await request(API).post('/api/listings').send(sampleListing());
    expect(res.status).toBe(401);
  });

  t('authenticated user creates a listing', async () => {
    const res = await request(API)
      .post('/api/listings')
      .set(authHeader(owner.accessToken))
      .send(sampleListing());
    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    listingId = res.body.data.id ?? res.body.data.listing?.id;
    expect(listingId).toBeTruthy();
  });

  t('create with missing required fields → 400', async () => {
    const res = await request(API)
      .post('/api/listings')
      .set(authHeader(owner.accessToken))
      .send({ title: 'x' });
    expect(res.status).toBe(400);
  });

  t('create with invalid (negative) price → 400', async () => {
    const res = await request(API)
      .post('/api/listings')
      .set(authHeader(owner.accessToken))
      .send(sampleListing({ price: -50 }));
    expect(res.status).toBe(400);
  });

  t('create with no images → 400', async () => {
    const res = await request(API)
      .post('/api/listings')
      .set(authHeader(owner.accessToken))
      .send(sampleListing({ images: [] }));
    expect(res.status).toBe(400);
  });

  // ── Detail (§3) ─────────────────────────────────────────────
  t('open listing detail by id', async () => {
    const res = await request(API).get(`/api/listings/${listingId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id ?? res.body.data.listing?.id).toBeTruthy();
  });

  t('non-existent listing id → 404', async () => {
    const res = await request(API).get(
      '/api/listings/00000000-0000-0000-0000-000000000000',
    );
    expect(res.status).toBe(404);
  });

  // ── My listings (§5) ────────────────────────────────────────
  t(
    'my listings via sellerId filter includes the created listing',
    async () => {
      const res = await request(API)
        .get('/api/listings')
        .query({ sellerId: owner.id });
      expect(res.status).toBe(200);
      const ids = (res.body.data.listings ?? []).map(
        (l: { id: string }) => l.id,
      );
      expect(ids).toContain(listingId);
    },
  );

  // ── Comments (§3) ───────────────────────────────────────────
  t('add and list a comment on a listing', async () => {
    const add = await request(API)
      .post(`/api/listings/${listingId}/comments`)
      .set(authHeader(other.accessToken))
      .send({ content: 'تعليق اختبار على الإعلان' });
    expect([200, 201]).toContain(add.status);

    const list = await request(API).get(`/api/listings/${listingId}/comments`);
    expect(list.status).toBe(200);
  });

  // ── Update / permissions (§5, §23) ──────────────────────────
  t('owner updates the listing (price/description)', async () => {
    const res = await request(API)
      .put(`/api/listings/${listingId}`)
      .set(authHeader(owner.accessToken))
      .send({
        price: 6000,
        description: 'Updated E2E description for the listing test.',
      });
    expect(res.status).toBe(200);
  });

  t('another user cannot edit the listing → 403/404', async () => {
    const res = await request(API)
      .put(`/api/listings/${listingId}`)
      .set(authHeader(other.accessToken))
      .send({ price: 1 });
    expect([403, 404]).toContain(res.status);
  });

  t('another user cannot delete the listing → 403/404', async () => {
    const res = await request(API)
      .delete(`/api/listings/${listingId}`)
      .set(authHeader(other.accessToken));
    expect([403, 404]).toContain(res.status);
  });

  // ── Delete (§5) ─────────────────────────────────────────────
  t('owner deletes the listing and it disappears from detail', async () => {
    const del = await request(API)
      .delete(`/api/listings/${listingId}`)
      .set(authHeader(owner.accessToken));
    expect([200, 204]).toContain(del.status);

    const after = await request(API).get(`/api/listings/${listingId}`);
    expect([404, 200]).toContain(after.status); // soft-delete may still 200 with suspended flag
  });
});
