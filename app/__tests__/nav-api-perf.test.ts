import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('tab navigation API performance', () => {
  it('does not add a new data library for feed caching', () => {
    const pkg = src('package.json');
    expect(pkg).not.toContain('@tanstack/react-query');
    expect(pkg).not.toContain('"swr"');
  });

  it('reuses a fresh listings bootstrap instead of refetching on every Home focus', () => {
    const ctx = src('contexts/AppContext.tsx');
    expect(ctx).toContain('shouldReuseFreshResult(postsLastSuccessAt.get(inflightKey), REFETCH_TTL_MS, options?.force)');
    expect(ctx).toContain('postsCacheByFeed');
    expect(ctx).toContain('postsApplyGenerationByFeed');
    expect(ctx).toContain('hydratePostsFeed');
    expect(ctx).toContain("fetchPosts('for_you', { force })");
    expect(src('components/market/MarketListingsFeed.tsx')).toContain('getBootstrappedListingsPage');
    expect(src('components/market/MarketListingsFeed.tsx')).toContain('setLoadFailed(true)');
  });

  it('skips profile seller listing walks when the same user was loaded within TTL', () => {
    const profile = src('app/(tabs)/profile.tsx');
    expect(profile).toContain('PROFILE_FOCUS_TTL_MS');
    expect(profile).toContain('shouldReuseFreshResult(lastListingsAt.current, PROFILE_FOCUS_TTL_MS, force)');
    expect(profile).toContain('loadMyListings(true)');
    expect(profile).toContain('void refetchUser()');
  });

  it('gives listing and stories GETs the same feed timeout and in-flight dedupe as posts', () => {
    expect(src('services/listings.ts')).toContain('fetchPublicFeed(url, accessToken)');
    expect(src('services/listings.ts')).toContain('buildListingsFeedUrl');
    expect(src('services/listings.ts')).toContain('isDefaultListingsFirstPage');
    expect(src('contexts/AppContext.tsx')).toContain('buildListingsFeedUrl(API_BASE)');
    expect(src('contexts/AppContext.tsx')).toContain('rememberListingsBootstrapPage');
    expect(src('contexts/AppContext.tsx')).toContain(
      'shouldReuseFreshResult(listingsLastSuccessAt, REFETCH_TTL_MS)',
    );
    expect(src('services/stories.ts')).toContain("fetchPublicFeed(`${API_BASE}/api/stories/feed`, accessToken)");
    expect(src('services/fetchPublicFeed.ts')).toContain('export const FEED_TIMEOUT_MS = 12_000');
    expect(src('services/fetchPublicFeed.ts')).toContain('dedupeGetResponse');
  });

  it('keeps existing market rows visible while a later first page is in flight', () => {
    const market = src('components/market/MarketListingsFeed.tsx');
    expect(market).toContain('if (!hasItemsRef.current) setLoading(true)');
    expect(market).toContain('if (gen !== loadGenRef.current) return');
    expect(market).toContain('getBootstrappedListingsPage');
    expect(market).toContain('const boot = getBootstrappedListingsPage(accessToken)');
  });

  it('keeps existing browse rows visible while filter or search revalidates', () => {
    const browse = src('app/market/browse.tsx');
    expect(browse).toContain('if (!hasItemsRef.current) setLoading(true)');
    expect(browse).toContain('if (gen !== loadGenRef.current) return');
    expect(browse).toContain('(loading || loadFailed) && items.length === 0');
  });

  it('lets pull-to-refresh bypass the posts TTL', () => {
    expect(src('app/(tabs)/posts.tsx')).toContain('force: Boolean(opts?.refresh || opts?.force)');
    expect(src('app/favorites.tsx')).toContain('force: opts?.refresh');
  });
});
