import { existsSync, readFileSync } from 'fs';
import path from 'path';
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

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

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
    expect(tabs).toContain('height: ds.tabBar.height');
    expect(tabs).toContain('backgroundColor: tokens.tabBar');
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
    expect(feed).toContain(
      `<VerificationBadge size={${FEED_VERIFIED_BADGE_SIZE}} tier={post.author.verifiedTier} />`,
    );
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

describe('sidebar - العلامات المرجعية is a plain menu row', () => {
  const panel = src('components/feature/AppSidebar.tsx');

  it('drops the standalone favorites row', () => {
    expect(panel).not.toContain("key: 'favorites'");
    expect(panel).not.toContain("route: '/favorites'");
  });

  it('sits under إضافة عرض / التوثيق and opens /bookmarks with close-then-navigate', () => {
    const row = "{ key: 'bookmarks', icon: 'bookmark-outline', label: 'العلامات المرجعية', route: '/bookmarks' },";
    expect(panel).toContain(row);
    const createAt = panel.indexOf("key: 'create-listing'");
    const nextRowAt = panel.indexOf('\n', createAt) + 1;
    // Verification sits directly under إضافة عرض, bookmarks right after it.
    const verificationRow = "{ key: 'verification', icon: 'verified', label: 'Verification', route: '/verification' },";
    expect(panel.indexOf(verificationRow)).toBe(panel.indexOf('{', nextRowAt));
    const afterVerification = panel.indexOf('\n', panel.indexOf(verificationRow)) + 1;
    expect(panel.indexOf(row)).toBe(panel.indexOf('{', afterVerification));
    expect(panel.indexOf(row)).toBeLessThan(panel.indexOf("key: 'promote'"));
    // Rendered by the same PRIMARY_ITEMS row as the others; go() = closeThenPush(route).
    expect(panel).toContain('PRIMARY_ITEMS.map((item) => (');
    expect(panel).toContain("item.key === 'create-listing' ? goCreateListing() : go(item.route)");
    expect(panel).toMatch(/const go = \(route: string\) => \{\s*closeThenPush\(route\);/);
  });

  it('has no inline bookmarks list, chips or horizontal scroll in the Sidebar', () => {
    expect(panel).not.toContain('SidebarBookmarks');
    expect(panel).not.toContain('sidebarBookmarks');
    expect(panel).not.toContain('SarhChip');
    expect(panel).not.toContain('horizontal');
    expect(panel).not.toContain('FlatList');
    expect(existsSync(path.join(root, 'components/feature/SidebarBookmarks.tsx'))).toBe(false);
    expect(existsSync(path.join(root, 'lib/sidebarBookmarks.ts'))).toBe(false);
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