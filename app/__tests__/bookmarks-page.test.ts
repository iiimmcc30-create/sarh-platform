import { readFileSync } from 'fs';
import path from 'path';
import {
  BOOKMARKS_PAGE_SIZE,
  BOOKMARKS_ROUTE,
  BOOKMARKS_TITLE,
  BOOKMARK_TABS,
  SAVED_SIGNED_OUT_TEXT,
  bookmarkEmptyText,
  bookmarkPagerIndex,
  bookmarkPagerOffset,
  resolveBookmarked,
  savedPostIdsNewestFirst,
} from '@/lib/bookmarks';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const page = src('app/bookmarks.tsx');

/** Source of one top-level function in the page file. */
function fn(name: string): string {
  const start = page.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = page.indexOf('\nfunction ', start + 1);
  return page.slice(start, next === -1 ? undefined : next);
}

/** JSX props of the first `<Tag ... />` inside a block, whitespace-normalised. */
function jsx(block: string, tag: string): string {
  const match = new RegExp(`<${tag}\\s`).exec(block);
  expect(match).not.toBeNull();
  const start = match!.index;
  return block.slice(start, block.indexOf('/>', start) + 2).replace(/\s+/g, ' ');
}

describe('/bookmarks page - two tabs over a horizontal pager', () => {
  it('is the العلامات المرجعية page with the standard header', () => {
    expect(BOOKMARKS_TITLE).toBe('العلامات المرجعية');
    expect(BOOKMARKS_ROUTE).toBe('/bookmarks');
    expect(page).toContain('<ScreenHeader variant="screen" title={BOOKMARKS_TITLE} showBack />');
  });

  it('has exactly two tabs: المفضلة (listings) then المحفوظات (posts)', () => {
    expect(BOOKMARK_TABS.map((t) => [t.key, t.label, t.kind])).toEqual([
      ['favorites', 'المفضلة', 'listing'],
      ['saved', 'المحفوظات', 'post'],
    ]);
    expect(page).toContain('accessibilityRole="tablist"');
    expect(page).toContain('accessibilityRole="tab"');
    expect(page).toContain('onPress={() => goTo(i)}');
  });

  it('uses a horizontal paging pager without a scrollbar, synced with the tabs', () => {
    const start = page.search(/<ScrollView\s/);
    expect(start).toBeGreaterThan(-1);
    const pager = page.slice(start, page.indexOf('>', page.indexOf('style=', start)) + 1).replace(/\s+/g, ' ');
    for (const prop of [
      'horizontal',
      'pagingEnabled',
      'showsHorizontalScrollIndicator={false}',
      'onMomentumScrollEnd={onMomentumScrollEnd}',
      'onLayout={positionPager}',
      'contentOffset={initialOffset}',
    ]) {
      expect(pager).toContain(prop);
    }
    expect(page).toContain('getRtlRow()');
    expect(page).not.toMatch(/(margin|padding)(Left|Right)/);
  });

  it('derives tab, indicator and pager position from ONE RTL-aware index', () => {
    // Tap -> same index scrolls the pager to that page's physical offset.
    expect(page).toContain('setIndex(next);');
    expect(page).toContain('scrollTo({ x: bookmarkPagerOffset(next, width, count, rtl), y: 0, animated: true })');
    // Swipe -> settled physical offset maps back to the index (RTL-aware).
    expect(page).toContain('setIndex(bookmarkPagerIndex(event.nativeEvent.contentOffset.x, width, count, rtl))');
    expect(page).toContain('const rtl = isHorizontalPagerRtl();');
    // No LTR-only mapping or logical-offset scrolling left.
    expect(page).not.toContain('pagerIndexFromOffset');
    expect(page).not.toContain('scrollToIndex');
    expect(page).not.toContain('getItemLayout');
    // Indicator + active label read the same index.
    expect(page).toContain('const active = index === i;');
    expect(page).toContain('toValue: index');
    // Each page renders its own content, keyed by its tab.
    expect(page).toContain("{tab.key === 'favorites' ? <FavoritesPage /> : <SavedPage />}");
  });
  it('animates with RN Animated only (native driver, no Reanimated)', () => {
    expect(page).toContain("Animated,");
    expect(page).toContain('useNativeDriver: true');
    expect(page).not.toContain('react-native-reanimated');
  });

  it('maps index <-> offset in RTL (page 0 on the right) and LTR', () => {
    const W = 400;
    // RTL: المفضلة (0) sits at physical x=400, المحفوظات (1) at x=0.
    expect(bookmarkPagerOffset(0, W, 2, true)).toBe(400);
    expect(bookmarkPagerOffset(1, W, 2, true)).toBe(0);
    expect(bookmarkPagerIndex(400, W, 2, true)).toBe(0);
    expect(bookmarkPagerIndex(0, W, 2, true)).toBe(1);
    expect(bookmarkPagerIndex(260, W, 2, true)).toBe(0);
    expect(bookmarkPagerIndex(120, W, 2, true)).toBe(1);
    // LTR: natural order.
    expect(bookmarkPagerOffset(0, W, 2, false)).toBe(0);
    expect(bookmarkPagerOffset(1, W, 2, false)).toBe(400);
    expect(bookmarkPagerIndex(0, W, 2, false)).toBe(0);
    expect(bookmarkPagerIndex(400, W, 2, false)).toBe(1);
    // Guards and clamping.
    expect(bookmarkPagerIndex(9999, W, 2, false)).toBe(1);
    expect(bookmarkPagerIndex(9999, W, 2, true)).toBe(0);
    expect(bookmarkPagerIndex(100, 0, 2, true)).toBe(0);
    expect(bookmarkPagerOffset(5, W, 2, false)).toBe(400);
    expect(bookmarkPagerOffset(-1, W, 2, true)).toBe(400);
  });

  it('round-trips every tab so indicator = section = content (tap and swipe)', () => {
    const W = 390;
    for (const rtl of [true, false]) {
      BOOKMARK_TABS.forEach((tab, i) => {
        const x = bookmarkPagerOffset(i, W, BOOKMARK_TABS.length, rtl);
        expect(BOOKMARK_TABS[bookmarkPagerIndex(x, W, BOOKMARK_TABS.length, rtl)].key).toBe(tab.key);
      });
    }
    // The old LTR-only formula picked the wrong tab in RTL: x=0 showed المحفوظات.
    expect(BOOKMARK_TABS[bookmarkPagerIndex(0, W, 2, true)].key).toBe('saved');
  });
});

describe('المفضلة uses the Home feed ListingCard exactly', () => {
  it('renders ListingCard with the same props and spacing as MarketListingsFeed', () => {
    const feed = src('components/market/MarketListingsFeed.tsx');
    const homeCard = jsx(feed, 'ListingCard');
    const favCard = jsx(fn('FavoritesPage'), 'ListingCard');
    expect(favCard).toBe(homeCard);
    expect(favCard).toContain('variant="list"');
    expect(favCard).toContain('listMode="market"');
    expect(favCard).toContain("safePush({ pathname: '/listing/[id]', params: { id: item.id } }, undefined, router)");
    expect(feed).toContain('listSeparator: {\n    height: spacing.sm,');
    expect(page).toMatch(/listSeparator: \{\s*height: spacing\.sm,/);
    expect(fn('FavoritesPage')).toContain('ItemSeparatorComponent={ListSeparator}');
  });

  it('reads the existing favorites store and fetches only missing listings, page by page', () => {
    const fav = fn('FavoritesPage');
    expect(fav).toContain('getListingFavoriteIds()');
    expect(fav).toContain('useFocusEffect(');
    expect(fav).toContain('useResolvedBookmarks<Listing>(\n    ids,\n    listings,\n    fetchListingById,');
    expect(fav).toContain('onEndReached={loadMore}');
    expect(fav).not.toContain('PostItem');
  });
});

describe('المحفوظات uses the Community feed PostItem exactly', () => {
  it('renders PostItem with the same enrich/bind props as app/(tabs)/posts.tsx', () => {
    const community = src('app/(tabs)/posts.tsx');
    const communityRender = 'const post = enrich(item);\n      return <PostItem post={post} {...bind(post)} />;';
    expect(community).toContain(communityRender);
    const saved = fn('SavedPage');
    expect(saved).toContain(communityRender);
    expect(saved).toContain('const { enrich, bind, observe } = usePostFeedActions();');
    expect(community).toContain('const { enrich, bind, observe } = usePostFeedActions();');
    // Same viewability-driven impressions as Community.
    expect(saved).toContain('itemVisiblePercentThreshold: 60, minimumViewTime: 800');
    expect(saved).toContain('onViewableItemsChanged={onViewableItemsChanged}');
    expect(saved).not.toContain('ListingCard');
  });

  it('reads the existing bookmark system; unsaving removes the row via bookmarkedPosts', () => {
    const saved = fn('SavedPage');
    expect(saved).toContain('savedPostIdsNewestFirst(bookmarkedPosts)');
    expect(saved).toContain('useResolvedBookmarks<Post>(ids, posts, fetchPostById)');
    expect(saved).not.toContain('toggleBookmark(');
    expect(savedPostIdsNewestFirst(new Set(['old', 'new']))).toEqual(['new', 'old']);
  });

  it('signed out: existing sign-in route instead of a list', () => {
    const saved = fn('SavedPage');
    expect(saved).toContain('if (!isAuthenticated) {');
    expect(saved).toContain("safePush('/auth/phone', undefined, router)");
    expect(SAVED_SIGNED_OUT_TEXT).toBeTruthy();
  });
});

describe('never mixed, lazy, with simple empty/loading states', () => {
  it('each page renders only its own kind', () => {
    expect(page).toContain("{tab.key === 'favorites' ? <FavoritesPage /> : <SavedPage />}");
  });

  it('resolves from cache first, fetches only missing ids, one page at a time', () => {
    const r = resolveBookmarked(['a', 'b', 'a', ' ', 'c', 'd'], [{ id: 'b' }], { c: null, d: { id: 'd' } });
    expect(r.items.map((x) => x.id)).toEqual(['b', 'd']);
    expect(r.missing).toEqual(['a']);
    const many = Array.from({ length: 50 }, (_, i) => `id${i}`);
    expect(resolveBookmarked(many, [], {}).missing).toHaveLength(BOOKMARKS_PAGE_SIZE);
    expect(resolveBookmarked(many, [], {}, BOOKMARKS_PAGE_SIZE * 2).missing).toHaveLength(BOOKMARKS_PAGE_SIZE * 2);
    expect(page).toContain('InteractionManager.runAfterInteractions');
    expect(page).toContain('setLimit((n) => n + BOOKMARKS_PAGE_SIZE)');
  });

  it('has a distinct empty message per tab and the skeleton loading pattern', () => {
    expect(bookmarkEmptyText('favorites')).toBe('لا توجد عروض في المفضلة بعد');
    expect(bookmarkEmptyText('saved')).toBe('لا توجد منشورات محفوظة بعد');
    expect(page).toContain("<BookmarksEmpty text={bookmarkEmptyText('favorites')} />");
    expect(page).toContain("<BookmarksEmpty text={bookmarkEmptyText('saved')} />");
    // First load shows skeleton rows shaped like each tab's real rows (no spinner).
    expect(page).toContain('<BookmarksLoading kind="listings" />');
    expect(page).toContain('<BookmarksLoading kind="posts" />');
    expect(page).toContain('<ListingCardSkeleton key={i} />');
    expect(page).toContain('<PostCardSkeleton key={i} withMedia={withMedia} />');
    expect(page).not.toContain('<ActivityIndicator color={color} />');
  });
});

describe('notification bell size', () => {
  it('bumps the shared header bell from 20 to 22 without touching the 40px tool box', () => {
    const bar = src('components/ui/HomeAppBar.tsx');
    expect(bar).toContain('const ICON_SIZE = space[20];');
    expect(bar).toContain('const BELL_ICON_SIZE = ICON_SIZE + 2;');
    expect(bar).toContain('iconSize={BELL_ICON_SIZE}');
    expect(bar).toContain('size={TOOL}');
    expect(bar).toContain('const TOOL = space[40];');
    expect(bar).toContain('const BAR_H = space[40];');
    const bell = src('components/notifications/NotificationBellButton.tsx');
    expect(bell).toContain('iconSize = 22,');
    // Badge stays anchored to the button box.
    expect(bell).toContain("position: 'absolute',\n      top: -2,");
  });
});