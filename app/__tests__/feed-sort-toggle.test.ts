import { readFileSync } from 'fs';
import path from 'path';
import { feedSortLabelAr, toggleFeedSortMode } from '@/lib/listingSort';
import {
  buildListingsFeedUrl,
  getBootstrappedListingsPage,
  isDefaultListingsFirstPage,
  rememberListingsBootstrapPage,
  resetListingsBootstrapCache,
  searchListingsPage,
} from '@/services/listings';
import { resetRequestCoordination } from '@/services/requestCoordination';

jest.mock('@/services/api', () => ({
  ensureApiReachable: async () => 'https://api.test',
}));

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

function jsonResponse(body: unknown, status = 200): Response {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    headers: { get: () => null },
    json: async () => JSON.parse(text),
    text: async () => text,
  } as unknown as Response;
}

function backendListing(id: string, createdAt: string) {
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
    createdAt,
    seller: { id: 's1', username: 's', country: 'SA' },
  };
}

describe('home feed sort toggle (الأحدث / الأقدم)', () => {
  afterEach(() => {
    resetRequestCoordination();
    resetListingsBootstrapCache();
    jest.restoreAllMocks();
  });

  it('toggles between newest and oldest with visible Arabic labels', () => {
    expect(toggleFeedSortMode('newest')).toBe('oldest');
    expect(toggleFeedSortMode('oldest')).toBe('newest');
    expect(feedSortLabelAr('newest')).toBe('الأحدث');
    expect(feedSortLabelAr('oldest')).toBe('الأقدم');
  });

  it('puts the sort in the request URL (the fetch/dedupe key) only for oldest', () => {
    expect(buildListingsFeedUrl('https://api.test')).toBe('https://api.test/api/listings');
    expect(buildListingsFeedUrl('https://api.test', { sort: 'newest' })).toBe(
      'https://api.test/api/listings',
    );
    expect(buildListingsFeedUrl('https://api.test', { sort: 'oldest' })).toBe(
      'https://api.test/api/listings?sort=oldest',
    );
    expect(buildListingsFeedUrl('https://api.test', { sort: 'oldest', cursor: 'c1' })).toBe(
      'https://api.test/api/listings?cursor=c1&sort=oldest',
    );
  });

  it('never serves or stores the newest bootstrap page for the oldest order', async () => {
    expect(isDefaultListingsFirstPage({ sort: 'oldest' })).toBe(false);
    expect(isDefaultListingsFirstPage({ sort: 'newest' })).toBe(true);

    rememberListingsBootstrapPage({
      listings: [{ id: 'newest-cached' } as never],
      nextCursor: null,
      hasMore: false,
    });

    const fetchMock = jest.fn(async (url: string) => {
      expect(url).toBe('https://api.test/api/listings?sort=oldest');
      return jsonResponse({
        success: true,
        data: {
          listings: [
            backendListing('old-1', '2025-01-01T00:00:00.000Z'),
            backendListing('old-2', '2025-02-01T00:00:00.000Z'),
          ],
          nextCursor: 'old-2',
          hasMore: true,
        },
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const page = await searchListingsPage({ sort: 'oldest' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(page.listings.map((l) => l.id)).toEqual(['old-1', 'old-2']);
    expect(page.nextCursor).toBe('old-2');
    // The newest bootstrap entry is untouched by the oldest page.
    expect(getBootstrappedListingsPage()?.listings[0]?.id).toBe('newest-cached');
  });

  it('reloads page 1 on toggle, keeps server order for oldest, and ignores stale pages', () => {
    const feed = src('components/market/MarketListingsFeed.tsx');
    expect(feed).toContain("sort: sortMode === 'oldest' ? ('oldest' as const) : undefined");
    expect(feed).toContain('[showFeaturedOnly, activeParentId, activeSubId, sortMode]');
    expect(feed).toContain("if (sortMode === 'oldest') return list;");
    // The previous order's rows are hidden (not wiped) until the new first page lands.
    expect(feed).not.toContain('setItems([])');
    expect(feed).toContain('setOrderLoading(true);');
    expect(feed).toContain('if (orderSwitchFromRef.current === next) {');
    expect(feed).toContain('data={orderLoading ? EMPTY_LISTINGS : filtered}');
    expect(feed).toContain('loading: loading || orderLoading,');
    expect(feed).toContain('loadGenRef.current += 1;');
    expect(feed).toMatch(/if \(gen !== loadGenRef\.current\) return;\r?\n\s*setItems\(\(prev\) => mergeListingPages/);
    // A failed switch reverts the label to the order the kept rows are in.
    expect(feed).toContain('setSortMode(previousOrder);');
    expect(feed).not.toContain('price_asc');
    const bar = src('components/market/MarketFilterBar.tsx');
    expect(bar).toContain('{sortLabel}');
    expect(bar).toContain('accessibilityLabel={`الترتيب: ${sortLabel}`}');
  });
});
