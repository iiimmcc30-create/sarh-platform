import { ListingsService } from './listings.service';
import {
  searchTextVariants,
  tokenizeSearchQuery,
} from '../search/lib/arabic-search.util';

function makeRow(
  index: number,
  total: number,
  extras: Record<string, unknown> = {},
) {
  return {
    id: `listing-${String(index + 1).padStart(3, '0')}`,
    pinned: false,
    featured: false,
    createdAt: new Date(Date.UTC(2026, 0, 1, 12, 0, total - index)),
    promotionWeight: 0,
    images: [],
    seller: { id: 'seller-1', verified: false },
    ...extras,
  };
}

describe('ListingsService.list pagination', () => {
  const repo = { findMany: jest.fn() };
  const usersRepo = { findBlockedRelationshipIds: jest.fn() };
  const cache = { get: jest.fn(), set: jest.fn() };
  const promotions = { expireStalePromotions: jest.fn() };
  const planResolver = { resolveSync: jest.fn() };

  let service: ListingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    usersRepo.findBlockedRelationshipIds.mockResolvedValue([]);
    cache.get.mockResolvedValue(null);
    promotions.expireStalePromotions.mockResolvedValue(undefined);
    planResolver.resolveSync.mockReturnValue(null);

    service = new ListingsService(
      repo as never,
      usersRepo as never,
      cache as never,
      { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      planResolver as never,
      {} as never,
      promotions as never,
      {} as never,
      {} as never,
    );
  });

  function mockCatalog(
    total: number,
    extras: (index: number) => Record<string, unknown> = () => ({}),
  ) {
    const all = Array.from({ length: total }, (_, i) =>
      makeRow(i, total, extras(i)),
    );
    repo.findMany.mockImplementation(
      async ({ take, cursor }: { take: number; cursor?: string }) => {
        const start = cursor
          ? all.findIndex((row) => row.id === cursor) + 1
          : 0;
        return all.slice(Math.max(start, 0), start + take);
      },
    );
    return all;
  }

  async function collectAllPages(query: Record<string, unknown> = {}) {
    const ids: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    let lastHasMore = false;
    while (pages < 20) {
      const page = await service.list({ ...query, cursor } as never);
      ids.push(...page.listings.map((item) => (item as { id: string }).id));
      pages += 1;
      lastHasMore = page.hasMore;
      if (!page.hasMore || !page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return { ids, pages, lastHasMore };
  }

  it('keeps a page size of 20 and exposes the next cursor', async () => {
    mockCatalog(21);
    const first = await service.list({} as never);
    expect(repo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 21,
        orderBy: expect.arrayContaining([{ id: 'desc' }]),
      }),
    );
    expect(first.listings).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBe('listing-020');
  });

  it.each([
    [21, 2],
    [50, 3],
    [100, 5],
  ])(
    'pages through %i listings so items after #20 are reachable',
    async (total, expectedPages) => {
      const all = mockCatalog(total);
      const { ids, pages, lastHasMore } = await collectAllPages();
      expect(pages).toBe(expectedPages);
      expect(lastHasMore).toBe(false);
      expect(new Set(ids).size).toBe(total);
      expect(ids).toHaveLength(total);
      expect(ids).toContain('listing-021');
      expect(ids).toContain(all[all.length - 1].id);
    },
  );

  it('does not skip or duplicate when createdAt is identical (M7)', async () => {
    const stamp = new Date('2026-01-01T00:00:00.000Z');
    const all = Array.from({ length: 25 }, (_, i) =>
      makeRow(i, 25, { createdAt: stamp }),
    );
    const ordered = [...all].sort((a, b) => b.id.localeCompare(a.id));
    repo.findMany.mockImplementation(
      async ({ take, cursor }: { take: number; cursor?: string }) => {
        const start = cursor
          ? ordered.findIndex((row) => row.id === cursor) + 1
          : 0;
        return ordered.slice(Math.max(start, 0), start + take);
      },
    );

    const { ids, lastHasMore } = await collectAllPages();
    expect(lastHasMore).toBe(false);
    expect(ids).toHaveLength(25);
    expect(new Set(ids).size).toBe(25);
  });

  it('passes sellerId independently of the public market first page', async () => {
    mockCatalog(25);
    await service.list({ sellerId: 'seller-own' } as never);
    expect(repo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 21,
        where: expect.objectContaining({
          sellerId: 'seller-own',
          status: 'active',
        }),
      }),
    );
  });

  it('uses Arabic variants for listing title search (H3/M6)', async () => {
    mockCatalog(4);
    await service.list({ search: 'ابل' } as never);
    const call = repo.findMany.mock.calls[0][0] as {
      where: { AND: unknown[] };
    };
    const serialized = JSON.stringify(call.where);
    for (const variant of ['ابل', 'إبل', 'أبل', 'آبل']) {
      expect(serialized).toContain(variant);
    }
    expect(tokenizeSearchQuery('ابل')).toEqual(['ابل']);
    expect(searchTextVariants('ابل')).toEqual(
      expect.arrayContaining(['إبل', 'أبل', 'آبل', 'ابل']),
    );
  });

  it('keeps promoted listings in a paged market result', async () => {
    mockCatalog(21, (i) => ({
      promotionWeight: i === 5 ? 10 : 0,
      featured: i === 0,
    }));
    const first = await service.list({} as never);
    expect(
      first.listings.some(
        (item) => (item as { promotionWeight?: number }).promotionWeight === 10,
      ),
    ).toBe(true);
    expect(first.hasMore).toBe(true);
  });
});
