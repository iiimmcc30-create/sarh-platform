import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import {
  createSellerListingsPager,
  isSellerListNearEnd,
  SELLER_LIST_NEAR_END_PX,
} from '@/services/sellerListingsPager';
import type { ListingSearchPage } from '@/services/listings';
import type { Listing } from '@/services/types';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

function listingStub(id: string): Listing {
  return {
    id,
    title: id,
    arabicTitle: id,
    price: 100,
    currency: 'SAR',
    category: 'sheep',
    breed: '',
    age: '',
    location: 'Riyadh',
    arabicLocation: 'الرياض',
    country: 'SA',
    images: [],
    description: '',
    arabicDescription: '',
    seller: {
      id: 'seller-1',
      username: 'seller',
      displayName: 'Seller',
      arabicName: 'بائع',
      verified: false,
      followers: 0,
      following: 0,
      rating: null,
      reviewCount: 0,
      country: 'SA',
      bio: '',
    },
    featured: false,
    pinned: false,
    postedAt: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function pageOf(
  ids: string[],
  opts: { nextCursor?: string | null; hasMore?: boolean } = {},
): ListingSearchPage {
  return {
    listings: ids.map(listingStub),
    nextCursor: opts.nextCursor ?? null,
    hasMore: opts.hasMore ?? Boolean(opts.nextCursor),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('P1-4 seller/profile listings demand-driven pagination', () => {
  it('opens with the first seller page only and does not walk 50 pages on mount', async () => {
    const searchPage = jest.fn(async () =>
      pageOf(
        Array.from({ length: 20 }, (_, i) => `p1-${i + 1}`),
        { nextCursor: 'cursor-2', hasMore: true },
      ),
    );
    const pager = createSellerListingsPager({ searchPage });

    await pager.loadFirstPage({ sellerId: 'seller-1', accessToken: 'token' });

    expect(searchPage).toHaveBeenCalledTimes(1);
    expect(searchPage).toHaveBeenCalledWith({ sellerId: 'seller-1' }, 'token');
    expect(pager.getState().listings).toHaveLength(20);
    expect(pager.getState().hasMore).toBe(true);
    expect(pager.getState().nextCursor).toBe('cursor-2');

    await new Promise((r) => setTimeout(r, 30));
    expect(searchPage).toHaveBeenCalledTimes(1);
  });

  it('requests the next page when the list is near the end', async () => {
    const searchPage = jest.fn(async (_params: { sellerId: string; cursor?: string }) => {
      if (_params.cursor === 'cursor-2') {
        return pageOf(['p2-1'], { hasMore: false });
      }
      return pageOf(['p1-1'], { nextCursor: 'cursor-2', hasMore: true });
    });
    const pager = createSellerListingsPager({ searchPage });
    await pager.loadFirstPage({ sellerId: 'seller-1' });

    expect(
      isSellerListNearEnd({
        layoutMeasurement: { height: 800 },
        contentOffset: { y: 1400 },
        contentSize: { height: 2000 },
      }),
    ).toBe(true);
    expect(SELLER_LIST_NEAR_END_PX).toBe(400);

    await pager.loadNextPage({ sellerId: 'seller-1' });
    expect(searchPage).toHaveBeenCalledTimes(2);
    expect(searchPage).toHaveBeenLastCalledWith(
      { sellerId: 'seller-1', cursor: 'cursor-2' },
      undefined,
    );
  });

  it('does not fire two in-flight requests for the same cursor', async () => {
    const first = pageOf(['a'], { nextCursor: 'c1', hasMore: true });
    const nextGate = deferred<ListingSearchPage>();
    const searchPage = jest.fn(async (params: { sellerId: string; cursor?: string }) => {
      if (!params.cursor) return first;
      return nextGate.promise;
    });
    const pager = createSellerListingsPager({ searchPage });
    await pager.loadFirstPage({ sellerId: 'seller-1' });

    const pending = Promise.all([
      pager.loadNextPage({ sellerId: 'seller-1' }),
      pager.loadNextPage({ sellerId: 'seller-1' }),
      pager.loadNextPage({ sellerId: 'seller-1' }),
    ]);
    await Promise.resolve();
    expect(searchPage).toHaveBeenCalledTimes(2);
    expect(searchPage.mock.calls.filter((call) => call[0].cursor === 'c1')).toHaveLength(1);

    nextGate.resolve(pageOf(['b'], { hasMore: false }));
    await pending;
    expect(searchPage).toHaveBeenCalledTimes(2);
  });

  it('stops later requests once hasMore is false', async () => {
    const searchPage = jest.fn(async () => pageOf(['only'], { hasMore: false }));
    const pager = createSellerListingsPager({ searchPage });
    await pager.loadFirstPage({ sellerId: 'seller-1' });
    await pager.loadNextPage({ sellerId: 'seller-1' });
    await pager.loadNextPage({ sellerId: 'seller-1' });
    expect(searchPage).toHaveBeenCalledTimes(1);
    expect(pager.getState().hasMore).toBe(false);
  });

  it('appends the second page without duplicating ids already on screen', async () => {
    const searchPage = jest.fn(async (params: { sellerId: string; cursor?: string }) => {
      if (!params.cursor) {
        return pageOf(['a', 'b'], { nextCursor: 'c1', hasMore: true });
      }
      return pageOf(['b', 'c'], { hasMore: false });
    });
    const pager = createSellerListingsPager({ searchPage });
    await pager.loadFirstPage({ sellerId: 'seller-1' });
    await pager.loadNextPage({ sellerId: 'seller-1' });
    expect(pager.getState().listings.map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the first page when the next page fails and allows retry', async () => {
    let nextShouldFail = true;
    const searchPage = jest.fn(async (params: { sellerId: string; cursor?: string }) => {
      if (!params.cursor) {
        return pageOf(['keep-me'], { nextCursor: 'c1', hasMore: true });
      }
      if (nextShouldFail) {
        throw new Error('listings_fetch_failed');
      }
      return pageOf(['page-2'], { hasMore: false });
    });
    const pager = createSellerListingsPager({ searchPage });
    await pager.loadFirstPage({ sellerId: 'seller-1' });
    await pager.loadNextPage({ sellerId: 'seller-1' });

    expect(pager.getState().listings.map((row) => row.id)).toEqual(['keep-me']);
    expect(pager.getState().loadMoreFailed).toBe(true);
    expect(pager.getState().hasMore).toBe(true);
    expect(pager.getState().nextCursor).toBe('c1');

    nextShouldFail = false;
    await pager.loadNextPage({ sellerId: 'seller-1' });
    expect(pager.getState().listings.map((row) => row.id)).toEqual(['keep-me', 'page-2']);
    expect(pager.getState().loadMoreFailed).toBe(false);
    expect(pager.getState().hasMore).toBe(false);
  });

  it('drops a stale next-page response so it cannot duplicate or overwrite newer data', async () => {
    const firstA = pageOf(['a1'], { nextCursor: 'c1', hasMore: true });
    const firstB = pageOf(['b1', 'b2'], { nextCursor: 'c2', hasMore: true });
    const staleNext = pageOf(['a1', 'stale'], { hasMore: false });
    const nextGate = deferred<ListingSearchPage>();
    let firstCalls = 0;
    const searchPage = jest.fn(async (params: { sellerId: string; cursor?: string }) => {
      if (!params.cursor) {
        firstCalls += 1;
        return firstCalls === 1 ? firstA : firstB;
      }
      return nextGate.promise;
    });
    const pager = createSellerListingsPager({ searchPage });
    await pager.loadFirstPage({ sellerId: 'seller-1' });

    const stalePending = pager.loadNextPage({ sellerId: 'seller-1' });
    await Promise.resolve();
    await pager.loadFirstPage({ sellerId: 'seller-1' });

    nextGate.resolve(staleNext);
    await stalePending;

    expect(pager.getState().listings.map((row) => row.id)).toEqual(['b1', 'b2']);
    expect(pager.getState().listings.map((row) => row.id)).not.toContain('stale');
    expect(pager.getState().nextCursor).toBe('c2');
  });

  it('drops a stale first-page response so it cannot overwrite a newer first page', async () => {
    const slowFirst = deferred<ListingSearchPage>();
    let calls = 0;
    const searchPage = jest.fn(async () => {
      calls += 1;
      if (calls === 1) return slowFirst.promise;
      return pageOf(['fresh'], { hasMore: false });
    });
    const pager = createSellerListingsPager({ searchPage });
    const stalePending = pager.loadFirstPage({ sellerId: 'seller-1' });
    await Promise.resolve();
    await pager.loadFirstPage({ sellerId: 'seller-1' });
    slowFirst.resolve(pageOf(['stale'], { nextCursor: 'old', hasMore: true }));
    await stalePending;

    expect(pager.getState().listings.map((row) => row.id)).toEqual(['fresh']);
    expect(pager.getState().hasMore).toBe(false);
  });

  it('does not continue a long pagination walk after dispose/unmount', async () => {
    const firstGate = deferred<ListingSearchPage>();
    const searchPage = jest.fn(async (params: { sellerId: string; cursor?: string }) => {
      if (!params.cursor) return firstGate.promise;
      return pageOf(['should-not-load'], { hasMore: true, nextCursor: 'c3' });
    });
    const pager = createSellerListingsPager({ searchPage });
    const pending = pager.loadFirstPage({ sellerId: 'seller-1' });
    pager.dispose();
    firstGate.resolve(pageOf(['p1'], { nextCursor: 'c2', hasMore: true }));
    await pending;

    expect(searchPage).toHaveBeenCalledTimes(1);
    await pager.loadNextPage({ sellerId: 'seller-1' });
    await pager.loadNextPage({ sellerId: 'seller-1' });
    expect(searchPage).toHaveBeenCalledTimes(1);
    expect(pager.getState().listings).toEqual([]);
  });

  it('keeps previous listings when the first page fails instead of turning failure into empty', async () => {
    const searchPage = jest.fn(async () => {
      if (searchPage.mock.calls.length === 1) {
        return pageOf(['kept'], { nextCursor: 'c1', hasMore: true });
      }
      throw new Error('listings_fetch_failed');
    });
    const pager = createSellerListingsPager({ searchPage });
    await pager.loadFirstPage({ sellerId: 'seller-1' });
    await expect(pager.loadFirstPage({ sellerId: 'seller-1' })).rejects.toThrow(
      'listings_fetch_failed',
    );
    expect(pager.getState().listings.map((row) => row.id)).toEqual(['kept']);
    expect(pager.getState().loadFailed).toBe(true);
  });
});

describe('P1-4 seller/profile listing callers', () => {
  it('stops Profile and User screens from walking every seller page on open', () => {
    const profile = src('app/(tabs)/profile.tsx');
    const user = src('app/users/[id].tsx');
    const layout = src('components/feature/ProfileScreenLayout.tsx');
    const hook = src('hooks/useSellerListingsPager.ts');

    expect(profile).not.toContain('searchAllSellerListings');
    expect(profile).toContain('useSellerListingsPager');
    expect(profile).toContain('loadFirstPage');
    expect(profile).toContain('loadNextPage');
    expect(profile).toContain('onAdsNearEnd');
    expect(profile).toContain('SellerListingsPaginationFooter');
    expect(profile).toContain('PROFILE_FOCUS_TTL_MS');
    expect(profile).toContain(
      'shouldReuseFreshResult(lastListingsAt.current, PROFILE_FOCUS_TTL_MS, force)',
    );
    expect(profile).toContain('loadMyListings(true)');

    expect(user).not.toContain('searchAllSellerListings');
    expect(user).toContain('useSellerListingsPager');
    expect(user).toContain('Promise.allSettled');
    expect(user).toContain('loadFirstPage()');
    expect(user).toContain('listingsLoadGen');
    expect(user).toContain('onAdsNearEnd');
    expect(user).toContain('SellerListingsPaginationFooter');

    expect(layout).toContain('onAdsNearEnd');
    expect(layout).toContain("activeTab !== 'ads'");
    expect(layout).toContain('isSellerListNearEnd');

    expect(hook).toContain('pager.dispose()');
    expect(src('app/promote.tsx')).toContain('searchAllSellerListings');
  });

  it('does not change market, browse, or butcher listing loaders', () => {
    expect(src('components/market/MarketListingsFeed.tsx')).toContain('onEndReached');
    expect(src('app/market/browse.tsx')).toContain('onEndReached');
    expect(src('app/(tabs)/market.tsx')).not.toContain('useSellerListingsPager');
    expect(src('components/market/MarketListingsFeed.tsx')).not.toContain('useSellerListingsPager');
    expect(src('app/market/browse.tsx')).not.toContain('useSellerListingsPager');
  });

  it('keeps searchAllSellerListings off production seller feeds after #253', () => {
    const hits: string[] = [];
    function walk(dir: string) {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name)) continue;
        const text = readFileSync(full, 'utf8');
        if (!text.includes('searchAllSellerListings')) continue;
        hits.push(path.relative(root, full).replace(/\\/g, '/'));
      }
    }
    walk(path.join(root, 'app'));
    walk(path.join(root, 'components'));
    walk(path.join(root, 'hooks'));
    walk(path.join(root, 'services'));
    expect(hits.sort()).toEqual(['app/promote.tsx', 'services/listings.ts']);
    expect(src('app/promote.tsx')).toContain('searchAllSellerListings(userId, accessToken)');
    expect(src('services/sellerListingsPager.ts')).toContain('loadFirstPage');
    expect(src('services/sellerListingsPager.ts')).not.toContain('SELLER_LISTINGS_MAX_PAGES');
  });
});
