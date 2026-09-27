import { readFileSync } from 'fs';
import path from 'path';
import {
  SIDEBAR_BOOKMARKS_AFTER_KEY,
  SIDEBAR_BOOKMARKS_KEY,
  SIDEBAR_BOOKMARKS_LIMIT,
  SIDEBAR_BOOKMARKS_TITLE,
  SIDEBAR_BOOKMARK_SECTIONS,
  isSidebarBookmarksSlot,
  resolveBookmarked,
  savedPostIdsNewestFirst,
  sidebarBookmarkEmptyText,
  sidebarBookmarkItems,
  withSidebarBookmarks,
} from '@/lib/sidebarBookmarks';
import {
  FEED_VERIFIED_BADGE_SIZE,
  VERIFIED_BADGE_GAP,
  shouldShowVerifiedBadge,
  sidebarShowsVerifiedBadge,
} from '@/lib/verifiedBadge';
import {
  TAB_ACTIVATE_SCALE,
  TAB_GLYPH_ANIMATED_STYLE_KEYS,
  TAB_PRESS_IN_MS,
  TAB_PRESS_OPACITY,
  TAB_PRESS_OUT_MS,
  TAB_PRESS_SCALE,
  isLayoutStyleKey,
} from '@/lib/tabBarMotion';
import { getListingFavoriteIds, toggleListingFavorite } from '@/lib/listingFavorite';
import type { Listing, Post } from '@/services/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const listing = (id: string, extra: Partial<Listing> = {}) =>
  ({
    id,
    title: `t-${id}`,
    arabicTitle: `عرض ${id}`,
    price: 1500,
    currency: 'SAR',
    images: [`https://cdn.example/${id}.jpg`],
    ...extra,
  }) as unknown as Listing;

const post = (id: string, extra: Partial<Post> = {}) =>
  ({
    id,
    content: `post ${id}`,
    arabicContent: `منشور ${id}`,
    author: { arabicName: 'مستخدم', displayName: 'user', username: 'u' },
    ...extra,
  }) as unknown as Post;

describe('bottom navigation - no active line, light icon motion', () => {
  const tabs = src('components/navigation/FloatingTabBar.tsx');

  it('has no indicator / line under the active tab', () => {
    expect(tabs).not.toMatch(/indicator/i);
    expect(tabs).not.toContain('translateX');
    expect(tabs).not.toContain('onLayout');
    expect(tabs).not.toMatch(/borderBottom/);
    // Active state is the icon variant only.
    expect(tabs).toContain("variant={focused ? 'sr' : 'rr'}");
  });

  it('keeps tab order, bar size and glass', () => {
    const order = ["route: 'index'", "route: 'search'", "{ kind: 'create', label:", "route: 'messages'", "route: 'posts'"]
      .map((token) => tabs.indexOf(token));
    order.forEach((at) => expect(at).toBeGreaterThan(-1));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(tabs).toContain('minHeight: 52');
    expect(tabs).toContain('backgroundColor: tokens.glass');
    expect(tabs).toContain('borderTopColor: tokens.glassBorder');
  });

  it('animates the tab icon on press/activation with RN Animated (native driver)', () => {
    expect(tabs).toContain('onPressIn={() => animatePress(true)}');
    expect(tabs).toContain('onPressOut={() => animatePress(false)}');
    expect(tabs).toContain('useNativeDriver: true');
    expect(tabs).toContain('<Animated.View style={glyphMotionStyle}>');
    expect(tabs).not.toContain('react-native-reanimated');
    expect(tabs).not.toContain('Animated.spring');
  });

  it('only animates transform/opacity (never layout)', () => {
    const style = tabs.match(/const glyphMotionStyle = \{([^\n]*)\};/)?.[1] ?? '';
    const keys = style
      .split(',')
      .map((part) => part.trim().split(/[:\s[]/)[0])
      .filter(Boolean);
    expect(keys.sort()).toEqual([...TAB_GLYPH_ANIMATED_STYLE_KEYS].sort());
    expect(style).toContain('transform: [{ scale }]');
    keys.forEach((key) => expect(isLayoutStyleKey(key)).toBe(false));
    expect(isLayoutStyleKey('width')).toBe(true);
    expect(isLayoutStyleKey('marginTop')).toBe(true);
    const driven = Array.from(tabs.matchAll(/Animated\.timing\((\w+)/g)).map((m) => m[1]);
    expect(driven.length).toBeGreaterThan(0);
    driven.forEach((name) => expect(['press', 'activation']).toContain(name));
  });

  it('stays subtle and fast (no strong bounce)', () => {
    expect(TAB_PRESS_SCALE).toBeGreaterThanOrEqual(0.85);
    expect(TAB_PRESS_SCALE).toBeLessThan(1);
    expect(TAB_PRESS_OPACITY).toBeGreaterThanOrEqual(0.7);
    expect(TAB_ACTIVATE_SCALE).toBeLessThanOrEqual(1.08);
    expect(TAB_PRESS_IN_MS).toBeLessThanOrEqual(120);
    expect(TAB_PRESS_OUT_MS).toBeLessThanOrEqual(200);
  });

  it('keeps the existing press handlers (animation never navigates or refetches)', () => {
    expect(tabs).toContain('onPress={() => onTabPress(tab.route, focused)}');
    expect(tabs).toContain('onPress={() => void navigateToCreateListing()}');
    const animatePress = tabs.match(/const animatePress = [\s\S]*?\n  };/)?.[0] ?? '';
    expect(animatePress).toContain('Animated.timing(press');
    expect(animatePress).not.toMatch(/navigate|fetch|emit|setChromeVisible/);
  });
});

describe('verified badge - unified with the Feed', () => {
  it('uses the Feed badge size and gap', () => {
    const feed = src('components/feature/PostItem.tsx');
    expect(feed).toContain(`<VerificationBadge size={${FEED_VERIFIED_BADGE_SIZE}} />`);
    expect(feed).toContain(`gap: ${VERIFIED_BADGE_GAP},`);
    expect(VERIFIED_BADGE_GAP).toBeGreaterThanOrEqual(3);
    expect(VERIFIED_BADGE_GAP).toBeLessThanOrEqual(6);
  });

  it('shared inline name keeps the badge on the same line, centred, after the name, RTL-safe', () => {
    const inline = src('components/ui/VerifiedInlineName.tsx');
    expect(inline).toContain('badgeSize = FEED_VERIFIED_BADGE_SIZE');
    expect(inline).toContain('gap: VERIFIED_BADGE_GAP');
    expect(inline).toContain("alignItems: 'center'");
    expect(inline).toContain("flexWrap: 'nowrap'");
    expect(inline).toContain('getRtlRow()');
    expect(inline).not.toMatch(/(margin|padding)(Left|Right)|row-reverse|marginTop|top:/);
    expect(inline.indexOf('{name}')).toBeLessThan(inline.indexOf('<VerificationBadge'));
  });

  it('only shows for an explicit verified === true', () => {
    expect(shouldShowVerifiedBadge(true)).toBe(true);
    expect(shouldShowVerifiedBadge(false)).toBe(false);
    expect(shouldShowVerifiedBadge(undefined)).toBe(false);
    expect(shouldShowVerifiedBadge('true')).toBe(false);
  });

  it('listing seller name uses the shared badge after the name', () => {
    const detail = src('app/listing/[id].tsx');
    expect(detail).not.toContain('<VerificationBadge');
    expect(detail).toContain('<VerifiedInlineName');
    expect(detail).toContain('verified={listing.seller.verified}');
  });

  it('listing comments use the Feed badge size (no custom size)', () => {
    for (const file of [
      'components/feature/ListingCommentsSection.tsx',
      'components/feature/ListingCommentsModal.tsx',
    ]) {
      const text = src(file);
      expect(text).toContain('<VerifiedInlineName');
      expect(text).toContain('verified={c.author.verified}');
      expect(text).not.toContain('badgeSize=');
    }
  });

  it('sidebar shows the badge only for a verified signed-in user', () => {
    expect(sidebarShowsVerifiedBadge(true, true)).toBe(true);
    expect(sidebarShowsVerifiedBadge(true, false)).toBe(false);
    expect(sidebarShowsVerifiedBadge(true, undefined)).toBe(false);
    expect(sidebarShowsVerifiedBadge(false, true)).toBe(false);
    const panel = src('components/feature/AppSidebar.tsx');
    expect(panel).toContain('sidebarShowsVerifiedBadge(isAuthenticated, me.verified)');
    expect(panel).toContain('verified={showVerified}');
    expect(panel).toContain('<VerifiedInlineName');
  });
});

describe('sidebar - العلامات المرجعية', () => {
  const panel = src('components/feature/AppSidebar.tsx');
  const block = src('components/feature/SidebarBookmarks.tsx');

  it('drops the standalone favorites row', () => {
    expect(panel).not.toContain("key: 'favorites'");
    expect(panel).not.toContain("route: '/favorites'");
  });

  it('places العلامات المرجعية directly under إضافة عرض', () => {
    expect(SIDEBAR_BOOKMARKS_TITLE).toBe('العلامات المرجعية');
    expect(SIDEBAR_BOOKMARKS_AFTER_KEY).toBe('create-listing');
    const keys = withSidebarBookmarks([
      { key: 'profile' },
      { key: 'create-listing' },
      { key: 'feed-suppliers' },
      { key: 'ministry' },
    ]).map((item) => item.key);
    expect(keys).toEqual(['profile', 'create-listing', SIDEBAR_BOOKMARKS_KEY, 'feed-suppliers', 'ministry']);
    const slots = withSidebarBookmarks([{ key: 'create-listing' }]).filter(isSidebarBookmarksSlot);
    expect(slots).toHaveLength(1);
    expect(isSidebarBookmarksSlot({ key: SIDEBAR_BOOKMARKS_KEY })).toBe(false);
    expect(panel).toContain('withSidebarBookmarks(PRIMARY_ITEMS)');
    expect(panel).toContain('{SIDEBAR_BOOKMARKS_TITLE}');
    expect(panel).toContain('<SidebarBookmarks />');
    expect(panel.indexOf("key: 'create-listing'")).toBeLessThan(panel.indexOf("key: 'feed-suppliers'"));
  });

  it('has exactly two sections: المفضلة (listings) and المحفوظات (posts)', () => {
    expect(SIDEBAR_BOOKMARK_SECTIONS.map((s) => [s.key, s.label, s.kind])).toEqual([
      ['favorites', 'المفضلة', 'listing'],
      ['saved', 'المحفوظات', 'post'],
    ]);
  });

  it('favorites shows listings and saved shows posts - never mixed', () => {
    const source = { listings: [listing('l1'), listing('l2')], posts: [post('p1')] };
    const favorites = sidebarBookmarkItems('favorites', source);
    const saved = sidebarBookmarkItems('saved', source);
    expect(favorites.map((i) => [i.kind, i.id])).toEqual([
      ['listing', 'l1'],
      ['listing', 'l2'],
    ]);
    expect(saved.map((i) => [i.kind, i.id])).toEqual([['post', 'p1']]);
    expect(sidebarBookmarkItems('favorites', { posts: [post('p1')] })).toEqual([]);
    expect(sidebarBookmarkItems('saved', { listings: [listing('l1')] })).toEqual([]);
  });

  it('reads the existing favorites and saved-posts systems and opens items the existing way', () => {
    expect(block).toContain('getListingFavoriteIds()');
    expect(block).toContain('bookmarkedPosts');
    expect(block).toContain("sidebarBookmarkItems('favorites', { listings: favorites.items })");
    expect(block).toContain("sidebarBookmarkItems('saved', { posts: saved.items })");
    expect(block).toContain("closeThenPush({ pathname: '/listing/[id]', params: { id: item.id } })");
    expect(block).toContain('closeThenPush(postDetailHref(item.id))');
    expect(block).not.toContain('ListingCard');
    expect(block).not.toContain('react-native-reanimated');
  });

  it('is a compact horizontal scroll without a scrollbar', () => {
    expect(block).toContain('horizontal');
    expect(block).toContain('showsHorizontalScrollIndicator={false}');
    expect(block).toContain('snapToInterval');
    expect(block).toContain('decelerationRate="fast"');
    expect(block).toContain('getRtlRow()');
    expect(block).not.toMatch(/(margin|padding)(Left|Right)|LinearGradient|shadow|elevation/);
    expect(SIDEBAR_BOOKMARKS_LIMIT).toBeLessThanOrEqual(20);
  });

  it('loads lazily from the cache first and only fetches missing ids', () => {
    expect(block).toContain('InteractionManager.runAfterInteractions');
    expect(block).toContain('resolveBookmarked(favoriteIds ?? [], listings, fetchedListings)');
    expect(block).toContain('resolveBookmarked(savedIds, posts, fetchedPosts)');
    const r = resolveBookmarked(['a', 'b', 'a', ' ', 'c', 'd'], [{ id: 'b' }], { c: null, d: { id: 'd' } });
    expect(r.items.map((x) => x.id)).toEqual(['b', 'd']);
    expect(r.missing).toEqual(['a']);
    const many = Array.from({ length: 30 }, (_, i) => `id${i}`);
    expect(resolveBookmarked(many, [], {}).missing).toHaveLength(SIDEBAR_BOOKMARKS_LIMIT);
    expect(savedPostIdsNewestFirst(new Set(['old', 'new']))).toEqual(['new', 'old']);
  });

  it('has a simple empty message per section', () => {
    const favEmpty = sidebarBookmarkEmptyText('favorites');
    const savedEmpty = sidebarBookmarkEmptyText('saved');
    expect(favEmpty).toBeTruthy();
    expect(savedEmpty).toBeTruthy();
    expect(favEmpty).not.toBe(savedEmpty);
    expect(block).toContain('{sidebarBookmarkEmptyText(section)}');
  });
});

describe('listing favorites store', () => {
  it('serializes rapid toggles so no update is lost', async () => {
    const results = await Promise.all([toggleListingFavorite('fast'), toggleListingFavorite('fast')]);
    expect(results).toEqual([true, false]);
    expect(await getListingFavoriteIds()).not.toContain('fast');
    await Promise.all([toggleListingFavorite('x1'), toggleListingFavorite('x2')]);
    const ids = await getListingFavoriteIds();
    expect(ids).toEqual(expect.arrayContaining(['x1', 'x2']));
  });
});