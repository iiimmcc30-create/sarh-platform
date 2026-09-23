import {
  buildListingsFeedUrl,
  getBootstrappedListingsPage,
  mergeListingPages,
  rememberListingsBootstrapPage,
  resetListingsBootstrapCache,
  searchAllSellerListings,
  searchListingsPage,
  shouldFetchNextListingPage,
  SELLER_LISTINGS_MAX_PAGES,
} from '@/services/listings';
import type { Listing } from '@/services/types';
import { resetRequestCoordination } from '@/services/requestCoordination';

jest.mock('@/services/api', () => ({
  ensureApiReachable: async () => 'https://api.test',
}));

function jsonResponse(body: unknown, status = 200): Response {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { get: () => null },
    json: async () => JSON.parse(text),
    text: async () => text,
  } as unknown as Response;
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

describe('marketplace listing pagination', () => {
  afterEach(() => {
    resetRequestCoordination();
    resetListingsBootstrapCache();
    jest.restoreAllMocks();
  });

  it('uses the same unfiltered listings URL as AppContext bootstrap', () => {
    expect(buildListingsFeedUrl('https://api.test')).toBe('https://api.test/api/listings');
    expect(buildListingsFeedUrl('https://api.test/', { featured: true })).toBe(
      'https://api.test/api/listings?featured=true',
    );
  });

  it('reuses a fresh bootstrap listings page only for the same auth tag', () => {
    expect(getBootstrappedListingsPage()).toBeNull();
    rememberListingsBootstrapPage({
      listings: [listingStub('boot')],
      nextCursor: 'boot',
      hasMore: true,
    });
    expect(getBootstrappedListingsPage()?.listings.map((row) => row.id)).toEqual(['boot']);
    expect(getBootstrappedListingsPage('token')).toBeNull();
  });

  it('returns nextCursor and hasMore from the listings API', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      expect(url).toContain('/api/listings?');
      expect(url).toContain('featured=true');
      return jsonResponse({
        success: true,
        data: {
          listings: Array.from({ length: 20 }, (_, i) => ({
            id: `m${i + 1}`,
            title: `L${i + 1}`,
            arabicTitle: `إعلان ${i + 1}`,
            price: 100,
            category: 'sheep',
            location: 'Riyadh',
            arabicLocation: 'الرياض',
            country: 'SA',
            images: [],
            description: 'desc long enough',
            arabicDescription: 'وصف كافٍ هنا',
            createdAt: '2026-01-01T00:00:00.000Z',
            seller: { id: 's1', username: 's', country: 'SA' },
          })),
          nextCursor: 'm20',
          hasMore: true,
        },
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const page = await searchListingsPage({ featured: true });
    expect(page.listings).toHaveLength(20);
    expect(page.nextCursor).toBe('m20');
    expect(page.hasMore).toBe(true);
  });

  it('walks cursors so listing 21+ is reachable for 21, 50, and 100 items', async () => {
    for (const total of [21, 50, 100]) {
      const fetchMock = jest.fn(async (url: string) => {
        const parsed = new URL(url);
        const cursor = parsed.searchParams.get('cursor');
        const start = cursor ? Number(cursor.replace('id-', '')) : 0;
        const slice = Array.from({ length: Math.min(20, total - start) }, (_, i) => ({
          id: `id-${start + i + 1}`,
          title: `L${start + i + 1}`,
          arabicTitle: `إعلان ${start + i + 1}`,
          price: 100,
          category: 'sheep',
          location: 'Riyadh',
          arabicLocation: 'الرياض',
          country: 'SA',
          images: [],
          description: 'desc long enough',
          arabicDescription: 'وصف كافٍ هنا',
          createdAt: '2026-01-01T00:00:00.000Z',
          seller: { id: 's1', username: 's', country: 'SA' },
        }));
        const end = start + slice.length;
        return jsonResponse({
          success: true,
          data: {
            listings: slice,
            nextCursor: end < total ? `id-${end}` : null,
            hasMore: end < total,
          },
        });
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      let cursor: string | undefined;
      const ids: string[] = [];
      for (let page = 0; page < 20; page += 1) {
        const result = await searchListingsPage({ cursor });
        ids.push(...result.listings.map((row) => row.id));
        if (!result.hasMore || !result.nextCursor) break;
        cursor = result.nextCursor;
      }

      expect(ids).toHaveLength(total);
      expect(ids).toContain('id-21');
      expect(ids[ids.length - 1]).toBe(`id-${total}`);
    }
  });

  it('loads every seller page and does not stop at the market first page', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      const parsed = new URL(url);
      expect(parsed.searchParams.get('sellerId')).toBe('me-1');
      const cursor = parsed.searchParams.get('cursor');
      const start = cursor === 'l20' ? 20 : 0;
      const listings = Array.from({ length: 5 }, (_, i) => ({
        id: `l${start + i + 1}`,
        title: `Mine ${start + i + 1}`,
        arabicTitle: `إعلاني ${start + i + 1}`,
        price: 50,
        category: 'sheep',
        location: 'Riyadh',
        arabicLocation: 'الرياض',
        country: 'SA',
        images: [],
        description: 'desc long enough',
        arabicDescription: 'وصف كافٍ هنا',
        createdAt: '2026-01-01T00:00:00.000Z',
        seller: { id: 'me-1', username: 'me', country: 'SA' },
      }));
      return jsonResponse({
        success: true,
        data: {
          listings:
            start === 0
              ? listings.concat(
                  Array.from({ length: 15 }, (_, i) => ({
                    ...listings[0],
                    id: `l${i + 6}`,
                  })),
                )
              : listings,
          nextCursor: start === 0 ? 'l20' : null,
          hasMore: start === 0,
        },
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const mine = await searchAllSellerListings('me-1', 'token');
    expect(mine.length).toBeGreaterThan(20);
    expect(mine.map((row) => row.id)).toContain('l21');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(SELLER_LISTINGS_MAX_PAGES).toBe(50);
  });

  it('merges pages without dropping earlier listings or duplicating ids', () => {
    const first = [listingStub('a'), listingStub('b')];
    const second = [listingStub('b'), listingStub('c')];
    expect(mergeListingPages(first, second).map((row) => row.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('does not request another page when hasMore is false', () => {
    expect(
      shouldFetchNextListingPage({
        hasMore: false,
        nextCursor: 'x',
        loading: false,
        loadingMore: false,
      }),
    ).toBe(false);
  });

  it('blocks concurrent load-more and initial loading', () => {
    expect(
      shouldFetchNextListingPage({
        hasMore: true,
        nextCursor: 'x',
        loading: false,
        loadingMore: true,
      }),
    ).toBe(false);
    expect(
      shouldFetchNextListingPage({
        hasMore: true,
        nextCursor: 'x',
        loading: true,
        loadingMore: false,
      }),
    ).toBe(false);
    expect(
      shouldFetchNextListingPage({
        hasMore: true,
        nextCursor: 'x',
        loading: false,
        loadingMore: false,
      }),
    ).toBe(true);
  });

  it('refresh starts from page one (no cursor)', async () => {
    const fetchMock = jest.fn(async (url: string) => {
      expect(new URL(url).searchParams.get('cursor')).toBeNull();
      return jsonResponse({
        success: true,
        data: { listings: [], nextCursor: null, hasMore: false },
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    await searchListingsPage({ search: 'ابل' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats HTTP 200 with an empty listings array as a real empty page', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        success: true,
        data: { listings: [], nextCursor: null, hasMore: false },
      }),
    ) as unknown as typeof fetch;

    const page = await searchListingsPage({});
    expect(page.listings).toEqual([]);
    expect(page.hasMore).toBe(false);
  });

  it('throws on HTTP failure instead of returning a successful empty page', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({ success: false }, 429),
    ) as unknown as typeof fetch;

    await expect(searchListingsPage({})).rejects.toThrow('listings_fetch_failed');
  });

  it('dedupes concurrent identical listing GETs through fetchPublicFeed', async () => {
    const fetchMock = jest.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return jsonResponse({
        success: true,
        data: { listings: [], nextCursor: null, hasMore: false },
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await Promise.all([
      searchListingsPage({ featured: true }),
      searchListingsPage({ featured: true }),
      searchListingsPage({ featured: true }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
