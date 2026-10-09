import { SaudiCitiesService } from '../geo/saudi-cities.service';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ListingsService } from './listings.service';
import { ListingPromotionService } from './promotion/listing-promotion.service';
import { PaymentsService } from '../payments/payments.service';
import {
  listingsFeedCacheKey,
  LISTINGS_FEED_CACHE_PATTERN,
  LISTINGS_FEED_CACHE_PREFIX,
} from './listings-cache-keys';

/** Minimal Redis-glob (SCAN MATCH) matcher: `*` and `?` wildcards. */
function redisGlobMatches(pattern: string, key: string): boolean {
  const source = pattern
    .split('')
    .map((ch) => {
      if (ch === '*') return '.*';
      if (ch === '?') return '.';
      return ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${source}$`).test(key);
}

/** In-memory stand-in for RedisCacheService with real pattern deletion. */
function makeMemoryCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: jest.fn(async (key: string) =>
      store.has(key) ? store.get(key) : null,
    ),
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    delPattern: jest.fn(async (pattern: string) => {
      let deleted = 0;
      for (const key of [...store.keys()]) {
        if (redisGlobMatches(pattern, key)) {
          store.delete(key);
          deleted += 1;
        }
      }
      return deleted;
    }),
  };
}

function feedKeys(store: Map<string, unknown>) {
  return [...store.keys()].filter((key) => key.startsWith('listings:'));
}

describe('listings feed cache keys', () => {
  it('keeps the exact v3 key format the list() writer has always produced', () => {
    expect(LISTINGS_FEED_CACHE_PREFIX).toBe('listings:v3:');
    expect(LISTINGS_FEED_CACHE_PATTERN).toBe('listings:v3:*');
    expect(listingsFeedCacheKey({ sort: 'newest' })).toBe(
      'listings:v3:{"sort":"newest"}',
    );
    expect(
      listingsFeedCacheKey({
        cursor: 'c1',
        category: 'sheep' as never,
        country: 'SA',
        featured: true,
        sellerId: 's1',
        sort: 'oldest',
      }),
    ).toBe(
      'listings:v3:{"cursor":"c1","category":"sheep","country":"SA","featured":true,"sellerId":"s1","sort":"oldest"}',
    );
  });

  it('invalidation pattern matches every key the writer builds, and not other caches', () => {
    const keys = [
      listingsFeedCacheKey({ sort: 'newest' }),
      listingsFeedCacheKey({ sort: 'oldest', cursor: 'x' }),
      listingsFeedCacheKey({ sort: 'newest', country: 'AE', featured: true }),
    ];
    for (const key of keys) {
      expect(redisGlobMatches(LISTINGS_FEED_CACHE_PATTERN, key)).toBe(true);
      expect(redisGlobMatches('listings:v2:*', key)).toBe(false);
    }
    expect(redisGlobMatches(LISTINGS_FEED_CACHE_PATTERN, 'listing:abc')).toBe(
      false,
    );
    expect(
      redisGlobMatches(LISTINGS_FEED_CACHE_PATTERN, 'search:explore:1'),
    ).toBe(false);
  });

  it('writer and invalidators share the constant; no stale v2 literal remains', () => {
    const service = readFileSync(
      join(__dirname, 'listings.service.ts'),
      'utf8',
    );
    const admin = readFileSync(
      join(__dirname, '..', 'admin', 'admin.service.ts'),
      'utf8',
    );
    expect(service).not.toMatch(/listings:v[0-9]+:/);
    expect(admin).not.toMatch(/listings:v[0-9]+:/);
    expect(service).toContain('listingsFeedCacheKey(');
    expect(service).toContain('delPattern(LISTINGS_FEED_CACHE_PATTERN)');
    expect(admin).toContain('delPattern(LISTINGS_FEED_CACHE_PATTERN)');
  });
});

describe('every listings feed invalidator uses the shared v3 pattern', () => {
  const src = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
  const invalidators: Array<[string, number]> = [
    ['listings.service.ts', 6],
    [join('..', 'admin', 'admin.service.ts'), 1],
    [join('boost', 'listing-boost.service.ts'), 1],
    [join('promotion', 'listing-promotion.service.ts'), 3],
    [join('..', 'payments', 'payments.service.ts'), 1],
  ];

  it.each(invalidators)(
    '%s has no hard-coded listings:vN: key and clears LISTINGS_FEED_CACHE_PATTERN',
    (rel, expectedCalls) => {
      const code = src(rel);
      expect(code).not.toMatch(/listings:v[0-9]+:/);
      expect(
        code.split('delPattern(LISTINGS_FEED_CACHE_PATTERN)').length - 1,
      ).toBe(expectedCalls);
      expect(code).toMatch(/from '[./]*(listings\/)?listings-cache-keys';/);
    },
  );

  it('keys module stays dependency-free (no imports, so no cycles)', () => {
    expect(src('listings-cache-keys.ts')).not.toMatch(/^\s*import\s/m);
  });

  it('ListingPromotionService.expireStalePromotions clears listings:v3:* keys', async () => {
    const cache = makeMemoryCache();
    cache.store.set(listingsFeedCacheKey({ sort: 'newest' }), {});
    cache.store.set(listingsFeedCacheKey({ sort: 'oldest' }), {});
    cache.store.set('listing:l1', {});
    const prisma = {
      listingPromotion: {
        findMany: jest.fn().mockResolvedValue([{ id: 'p1', listingId: 'l1' }]),
        updateMany: jest.fn().mockReturnValue('updateMany'),
      },
      listing: {
        update: jest.fn().mockReturnValue('update'),
        updateMany: jest.fn().mockReturnValue('updateMany'),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const promotions = new ListingPromotionService(
      prisma as never,
      { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as never,
      {} as never,
      cache as never,
      {} as never,
      {} as never,
    );

    await promotions.expireStalePromotions();

    expect(cache.delPattern).toHaveBeenCalledWith('listings:v3:*');
    expect(cache.delPattern).not.toHaveBeenCalledWith('listings:v2:*');
    expect(feedKeys(cache.store)).toEqual([]);
    expect(cache.store.has('listing:l1')).toBe(false);
  });

  it('PaymentsService listing cache invalidation clears listings:v3:* keys', async () => {
    const cache = makeMemoryCache();
    cache.store.set(listingsFeedCacheKey({ sort: 'newest' }), {});
    cache.store.set(listingsFeedCacheKey({ sort: 'newest', country: 'SA' }), {});
    cache.store.set('listing:l9', {});
    const payments = Object.create(PaymentsService.prototype) as {
      cache: unknown;
      invalidateListingCaches: (listingId?: string) => Promise<void>;
    };
    payments.cache = cache;

    await payments.invalidateListingCaches('l9');

    expect(cache.delPattern).toHaveBeenCalledWith('listings:v3:*');
    expect(cache.delPattern).not.toHaveBeenCalledWith('listings:v2:*');
    expect(feedKeys(cache.store)).toEqual([]);
    expect(cache.store.has('listing:l9')).toBe(false);
  });
});

describe('ListingsService cache invalidation clears the real v3 feed keys', () => {
  const rows = [
    {
      id: 'l2',
      pinned: false,
      featured: false,
      createdAt: new Date('2026-01-02T00:00:00Z'),
      promotionWeight: 0,
      images: [],
      seller: { id: 'seller-1', verified: false },
    },
    {
      id: 'l1',
      pinned: false,
      featured: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      promotionWeight: 0,
      images: [],
      seller: { id: 'seller-1', verified: false },
    },
  ];
  const repo = {
    findMany: jest.fn(),
    findSellerId: jest.fn(),
    softDelete: jest.fn(),
    findActiveListingMeta: jest.fn(),
    findCommentMeta: jest.fn(),
    deleteComment: jest.fn(),
  };
  const usersRepo = { findBlockedRelationshipIds: jest.fn() };
  const promotions = { expireStalePromotions: jest.fn() };
  const planResolver = { resolveSync: jest.fn() };
  const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
  const user = { userId: 'seller-1', username: 'seller', role: 'USER' };

  let cache: ReturnType<typeof makeMemoryCache>;
  let service: ListingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = makeMemoryCache();
    repo.findMany.mockImplementation(async () => rows.map((r) => ({ ...r })));
    repo.findSellerId.mockResolvedValue({
      sellerId: 'seller-1',
      origin: 'USER',
    });
    repo.softDelete.mockResolvedValue(undefined);
    repo.findActiveListingMeta.mockResolvedValue({ sellerId: 'seller-1' });
    repo.findCommentMeta.mockResolvedValue({ authorId: 'seller-1' });
    repo.deleteComment.mockResolvedValue(undefined);
    usersRepo.findBlockedRelationshipIds.mockResolvedValue([]);
    promotions.expireStalePromotions.mockResolvedValue(undefined);
    planResolver.resolveSync.mockReturnValue(null);

    service = new ListingsService(
      repo as never,
      usersRepo as never,
      cache as never,
      logger as never,
      {} as never,
      {} as never,
      {} as never,
      planResolver as never,
      {} as never,
      promotions as never,
      {} as never,
      {} as never,
      new SaudiCitiesService({} as never),
    );
  });

  async function warmFeedCache() {
    await service.list({} as never);
    await service.list({ sort: 'oldest' } as never);
    await service.list({ country: 'SA' } as never);
    const keys = feedKeys(cache.store);
    expect(keys).toEqual([
      listingsFeedCacheKey({ sort: 'newest' }),
      listingsFeedCacheKey({ sort: 'oldest' }),
      listingsFeedCacheKey({ sort: 'newest', country: 'SA' }),
    ]);
    // Served from cache on the second read (no extra DB hit).
    repo.findMany.mockClear();
    await service.list({} as never);
    expect(repo.findMany).not.toHaveBeenCalled();
  }

  it('remove() deletes every cached v3 feed page so the next list() hits the DB', async () => {
    await warmFeedCache();

    await service.remove(user as never, 'l1', {
      sold: true,
      reason: 'sold elsewhere',
    } as never);

    expect(cache.delPattern).toHaveBeenCalledWith('listings:v3:*');
    expect(cache.delPattern).not.toHaveBeenCalledWith('listings:v2:*');
    expect(feedKeys(cache.store)).toEqual([]);

    await service.list({} as never);
    expect(repo.findMany).toHaveBeenCalledTimes(1);
  });

  it('deleteComment() also clears the real v3 feed keys', async () => {
    await warmFeedCache();

    await service.deleteComment(user as never, 'l1', 'c1');

    expect(cache.delPattern).toHaveBeenCalledWith('listings:v3:*');
    expect(cache.delPattern).not.toHaveBeenCalledWith('listings:v2:*');
    expect(feedKeys(cache.store)).toEqual([]);
  });
});
