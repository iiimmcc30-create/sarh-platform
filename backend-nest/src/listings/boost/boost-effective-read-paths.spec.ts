/**
 * Expired Featured / Pinned / Promoted must never reach the user as active,
 * even when an old copy of the listing is still sitting in Redis.
 */
import { UnifiedSearchService } from '../../search/unified-search.service';
import { ExploreSearchService } from '../../search/explore-search.service';
import { ListingPromotionService } from '../promotion/listing-promotion.service';
import { interleavePromotedListings } from '../promotion/promotion-ranking.util';
import { withEffectiveBoostState } from './boost-effective-state';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const iso = (minutes: number) =>
  new Date(NOW.getTime() + minutes * 60_000).toISOString();

type CachedListing = {
  id: string;
  featured: boolean;
  featuredUntil: string | null;
  pinned: boolean;
  pinnedUntil: string | null;
  promoted?: boolean;
  promotedUntil?: string | null;
  promotionWeight?: number;
};

/** A listing row exactly as it comes back from Redis (JSON: dates are ISO strings). */
function cachedListing(
  id: string,
  over: Partial<CachedListing> = {},
): CachedListing {
  return {
    id,
    featured: false,
    featuredUntil: null,
    pinned: false,
    pinnedUntil: null,
    promoted: false,
    promotedUntil: null,
    promotionWeight: 0,
    ...over,
  };
}

function cachedSearchPayload(rows: CachedListing[]) {
  return {
    query: 'sheep',
    type: 'listings',
    durationMs: 3,
    groups: [
      {
        type: 'listings',
        page: 1,
        limit: 20,
        hasMore: false,
        items: rows.map((row) => ({
          type: 'listings',
          id: row.id,
          title: row.id,
          relevance: 1,
          data: row,
        })),
      },
    ],
  };
}

function makeUnifiedSearch(cached: unknown) {
  const cache = {
    isEnabled: jest.fn().mockReturnValue(true),
    get: jest.fn().mockResolvedValue(cached),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new UnifiedSearchService(
    {} as never,
    cache as never,
    logger as never,
  );
  return { service, cache };
}

async function searchFromStaleCache(rows: CachedListing[]) {
  const { service } = makeUnifiedSearch(cachedSearchPayload(rows));
  const res = await service.search({ q: 'sheep', type: 'listings' } as never);
  const items = res.groups[0].items;
  return new Map(
    items.map((item) => [item.id, item.data as unknown as CachedListing]),
  );
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('stale Redis search cache never shows an expired boost', () => {
  it('expired Featured must not appear as Featured', async () => {
    const byId = await searchFromStaleCache([
      cachedListing('expired', { featured: true, featuredUntil: iso(-5) }),
      cachedListing('active', { featured: true, featuredUntil: iso(60) }),
    ]);
    expect(byId.get('expired')?.featured).toBe(false);
    expect(byId.get('active')?.featured).toBe(true);
  });

  it('expired Pinned must not appear as Pinned', async () => {
    const byId = await searchFromStaleCache([
      cachedListing('expired', { pinned: true, pinnedUntil: iso(-1) }),
      cachedListing('active', { pinned: true, pinnedUntil: iso(30) }),
    ]);
    expect(byId.get('expired')?.pinned).toBe(false);
    expect(byId.get('active')?.pinned).toBe(true);
  });

  it('expired Featured + active Pinned keeps only Pinned', async () => {
    const byId = await searchFromStaleCache([
      cachedListing('l1', {
        featured: true,
        featuredUntil: iso(-10),
        pinned: true,
        pinnedUntil: iso(10),
      }),
    ]);
    expect(byId.get('l1')).toMatchObject({ featured: false, pinned: true });
  });

  it('active Featured + expired Pinned keeps only Featured', async () => {
    const byId = await searchFromStaleCache([
      cachedListing('l1', {
        featured: true,
        featuredUntil: iso(10),
        pinned: true,
        pinnedUntil: iso(-10),
      }),
    ]);
    expect(byId.get('l1')).toMatchObject({ featured: true, pinned: false });
  });

  it('expired Promotion in a cached result is no longer promoted', async () => {
    const byId = await searchFromStaleCache([
      cachedListing('l1', {
        promoted: true,
        promotedUntil: iso(-2),
        promotionWeight: 150,
      }),
    ]);
    expect(byId.get('l1')?.promoted).toBe(false);
  });
});

describe('stale Redis explore cache never shows an expired boost', () => {
  it('re-evaluates cached listing sections (Featured, Pinned) at read time', async () => {
    const cache = {
      isEnabled: jest.fn().mockReturnValue(true),
      get: jest.fn().mockResolvedValue({
        sections: [
          { type: 'trending_topics', title: 't', items: [{ tag: '#x' }] },
          {
            type: 'listings',
            title: 'l',
            items: [
              cachedListing('regular'),
              cachedListing('expiredPin', {
                pinned: true,
                pinnedUntil: iso(-1),
              }),
              cachedListing('featuredPlan', { featured: true }),
              cachedListing('expiredFeat', {
                featured: true,
                featuredUntil: iso(-1),
              }),
            ],
          },
        ],
      }),
      set: jest.fn(),
    };
    const service = new ExploreSearchService(
      {} as never,
      {} as never,
      cache as never,
    );

    const res = await service.getExploreFeed();
    const listings = res.sections.find((s) => s.type === 'listings')!
      .items as CachedListing[];
    const byId = new Map(listings.map((l) => [l.id, l]));
    expect(byId.get('expiredPin')?.pinned).toBe(false);
    expect(byId.get('expiredFeat')?.featured).toBe(false);
    // Plan-granted Featured (no Until) stays active and ranks first.
    expect(byId.get('featuredPlan')?.featured).toBe(true);
    expect(listings[0].id).toBe('featuredPlan');
    // Non-listing sections are returned untouched.
    expect(res.sections[0].items).toEqual([{ tag: '#x' }]);
  });
});

describe('Promotion expiry (promotedUntil) in the effective state and ranking', () => {
  it('withEffectiveBoostState drops an expired Promotion, keeps an active one', () => {
    expect(
      withEffectiveBoostState(
        cachedListing('a', {
          promoted: true,
          promotedUntil: iso(-1),
          promotionWeight: 150,
        }),
      ),
    ).toMatchObject({ promoted: false, promotionWeight: 0 });
    expect(
      withEffectiveBoostState(
        cachedListing('b', {
          promoted: true,
          promotedUntil: iso(5),
          promotionWeight: 150,
        }),
      ),
    ).toMatchObject({ promoted: true, promotionWeight: 150 });
  });

  it('interleavePromotedListings ranks an expired Promotion as a regular listing', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`,
      createdAt: iso(-(i + 1) * 60),
      promoted: false,
      promotionWeight: 0,
    }));
    const stale = {
      id: 'stale',
      createdAt: iso(-24 * 60),
      promoted: true,
      promotedUntil: iso(-1),
      promotionWeight: 500,
    };
    const out = interleavePromotedListings([...rows, stale]);
    // Oldest regular listing goes last; a live promotion would be interleaved earlier.
    expect(out[out.length - 1].id).toBe('stale');
  });
});

describe('ListingPromotionService promotion expiry', () => {
  function makeService() {
    const prisma = {
      listing: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      listingPromotion: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'p-old', listingId: 'l1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn((ops: Array<Promise<unknown>>) => Promise.all(ops)),
    };
    const cache = {
      del: jest.fn().mockResolvedValue(undefined),
      delPattern: jest.fn().mockResolvedValue(0),
    };
    const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    const service = new ListingPromotionService(
      prisma as never,
      logger as never,
      {} as never,
      cache as never,
      {} as never,
      {} as never,
    );
    return { service, prisma, cache };
  }

  it('clears promoted only when promotedUntil passed and no other paid promotion is active', async () => {
    const { service, prisma } = makeService();
    await service.expireStalePromotions();

    expect(prisma.listing.update).not.toHaveBeenCalled();
    expect(prisma.listing.updateMany).toHaveBeenCalledTimes(1);
    const call = prisma.listing.updateMany.mock.calls[0][0];
    expect(call.data).toEqual({
      promoted: false,
      promotedUntil: null,
      promotionWeight: 0,
      promotionTier: null,
    });
    expect(call.where).toMatchObject({
      id: 'l1',
      OR: [{ promotedUntil: null }, { promotedUntil: { lte: NOW } }],
      promotions: { none: { status: 'paid', expiresAt: { gt: NOW } } },
    });
    expect(prisma.listingPromotion.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['p-old'] } },
      data: { status: 'overdue' },
    });
  });

  it('invalidates feed, detail and search caches after promotion expiry', async () => {
    const { service, cache } = makeService();
    await service.expireStalePromotions();

    expect(cache.delPattern).toHaveBeenCalledWith('listings:v3:*');
    expect(cache.delPattern).toHaveBeenCalledWith('search:explore:*');
    expect(cache.delPattern).toHaveBeenCalledWith('search:unified:*');
    expect(cache.del).toHaveBeenCalledWith('listing:l1');
  });
});
