import { readFileSync } from 'fs';
import path from 'path';
import {
  getBootstrappedListingsPage,
  isDefaultListingsFirstPage,
  rememberListingsBootstrapPage,
  resetListingsBootstrapCache,
  searchListingsPage,
} from '@/services/listings';
import { resetRequestCoordination } from '@/services/requestCoordination';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

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

function backendListing(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: id,
    arabicTitle: id,
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
    ...extra,
  };
}

describe('P0-3 default listings page is shared, other queries are not', () => {
  afterEach(() => {
    resetRequestCoordination();
    resetListingsBootstrapCache();
    jest.restoreAllMocks();
  });

  it('treats only the unfiltered first page as the shared default query', () => {
    expect(isDefaultListingsFirstPage({})).toBe(true);
    expect(isDefaultListingsFirstPage({ search: 'ا' })).toBe(true);
    expect(isDefaultListingsFirstPage({ search: 'ابل' })).toBe(false);
    expect(isDefaultListingsFirstPage({ categoryId: 'cat-1' })).toBe(false);
    expect(isDefaultListingsFirstPage({ subcategoryId: 'sub-1' })).toBe(false);
    expect(isDefaultListingsFirstPage({ featured: true })).toBe(false);
    expect(isDefaultListingsFirstPage({ cursor: 'c1' })).toBe(false);
    expect(isDefaultListingsFirstPage({ sellerId: 's1' })).toBe(false);
    expect(isDefaultListingsFirstPage({ country: 'SA' })).toBe(false);
  });

  it('reuses a remembered default first page instead of fetching listings again', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        success: true,
        data: {
          listings: [backendListing('boot-1')],
          nextCursor: 'c1',
          hasMore: true,
        },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const first = await searchListingsPage({});
    const second = await searchListingsPage({});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.listings.map((row) => row.id)).toEqual(['boot-1']);
    expect(second.listings.map((row) => row.id)).toEqual(['boot-1']);
    expect(second.nextCursor).toBe('c1');
    expect(getBootstrappedListingsPage()?.listings.map((row) => row.id)).toEqual(['boot-1']);
  });

  it('does not reuse the default page for search, category, featured, or pagination', async () => {
    rememberListingsBootstrapPage({
      listings: [
        {
          id: 'boot',
          title: 'boot',
          arabicTitle: 'boot',
          price: 1,
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
            id: 's1',
            username: 's',
            displayName: '',
            arabicName: '',
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
          postedAt: '',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      nextCursor: 'boot',
      hasMore: true,
    });
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        success: true,
        data: { listings: [backendListing('other')], nextCursor: null, hasMore: false },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await searchListingsPage({ search: 'ابل' });
    await searchListingsPage({ categoryId: 'cat-1' });
    await searchListingsPage({ featured: true });
    await searchListingsPage({ cursor: 'boot' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const urls = (fetchMock as unknown as jest.Mock).mock.calls.map((call: unknown[]) =>
      String(call[0]),
    );
    expect(urls[0]).toContain('search=');
    expect(urls[1]).toContain('categoryId=cat-1');
    expect(urls[2]).toContain('featured=true');
    expect(urls[3]).toContain('cursor=boot');
  });

  it('does not cache an empty or failed default page for later hydration', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        success: true,
        data: { listings: [], nextCursor: null, hasMore: false },
      }),
    ) as unknown as typeof fetch;
    await searchListingsPage({});
    expect(getBootstrappedListingsPage()).toBeNull();

    global.fetch = jest.fn(async () => jsonResponse({ success: false }, 500)) as unknown as typeof fetch;
    await expect(searchListingsPage({})).rejects.toThrow('listings_fetch_failed');
    expect(getBootstrappedListingsPage()).toBeNull();
  });

  it('hydrates Market from the shared default page only when no server filters are set', () => {
    const market = src('components/market/MarketListingsFeed.tsx');
    expect(market).toContain('if (!hasServerFilters)');
    expect(market).toContain('const boot = getBootstrappedListingsPage(accessToken)');
    expect(market).toContain('apiFilters.featured || apiFilters.categoryId || apiFilters.subcategoryId');
    expect(market).toContain('const gen = ++loadGenRef.current');
    expect(market).toContain('if (gen !== loadGenRef.current) return');
    expect(market).toContain('shouldFetchNextListingPage');
    expect(market).not.toContain('RefreshControl');
    expect(market).toContain('sortMode');
    expect(market).toContain('nextMarketSortMode');
    expect(market).toContain('resolveNearbyRegionSelection');
    expect(market).not.toContain('searchListingsPage({ ...apiFilters, sort');
  });

  it('makes listingsLastSuccessAt part of the AppContext cache decision', () => {
    const ctx = src('contexts/AppContext.tsx');
    expect(ctx).toContain('shouldReuseFreshResult(listingsLastSuccessAt, REFETCH_TTL_MS)');
    expect(ctx).toContain('getBootstrappedListingsPage(accessToken)');
    expect(ctx).toContain('fetchListings({ force })');
    expect(ctx).toContain('rememberListingsBootstrapPage');
    expect(src('app/listing/[id].tsx')).toContain('const { listings, me, removeListing } = useApp()');
    expect(src('services/listings.ts')).toContain('isDefaultListingsFirstPage(params)');
  });
});
