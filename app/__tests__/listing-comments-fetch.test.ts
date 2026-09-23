import {
  fetchListingComments,
  resetListingCommentsFetchState,
} from '../components/feature/listingCommentsUtils';

jest.mock('@/services/api', () => ({
  API_BASE: 'https://example.test',
}));

describe('fetchListingComments coordination', () => {
  beforeEach(() => {
    resetListingCommentsFetchState();
    jest.clearAllMocks();
  });

  it('dedupes concurrent requests for the same listing', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { comments: [{ id: 'c1', content: 'hi', createdAt: '2026-01-01T00:00:00Z', author: { id: 'u1', username: 'u', displayName: 'U', arabicName: 'U' } }] },
        }),
      } as Response;
    });

    const [a, b, c] = await Promise.all([
      fetchListingComments('listing-1'),
      fetchListingComments('listing-1'),
      fetchListingComments('listing-1'),
    ]);

    expect(calls).toBe(1);
    expect(a.comments).toHaveLength(1);
    expect(b.comments).toHaveLength(1);
    expect(c.comments).toHaveLength(1);
  });

  it('serves fresh cache without hitting network again', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { comments: [] },
        }),
      } as Response;
    });

    await fetchListingComments('listing-2');
    await fetchListingComments('listing-2');

    expect(calls).toBe(1);
  });

  it('respects rate-limit cooldown and avoids retry spam on 429', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      return {
        ok: false,
        status: 429,
        headers: { get: (key: string) => (key === 'Retry-After' ? '120' : null) },
        json: async () => ({
          messageAr: 'طلبات كثيرة جداً، حاول لاحقاً',
          retryAfter: 120,
        }),
      } as Response;
    });

    const first = await fetchListingComments('listing-3');
    const second = await fetchListingComments('listing-3', { force: true });

    expect(first.rateLimited).toBe(true);
    expect(first.error).toContain('طلبات كثيرة');
    expect(second.rateLimited).toBe(true);
    expect(calls).toBe(1);
  });

  it('force refresh bypasses TTL cache but still dedupes inflight', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { comments: [] },
        }),
      } as Response;
    });

    await fetchListingComments('listing-4');
    const forced = fetchListingComments('listing-4', { force: true });
    const forcedDup = fetchListingComments('listing-4', { force: true });
    await Promise.all([forced, forcedDup]);

    expect(calls).toBe(2);
  });
});
