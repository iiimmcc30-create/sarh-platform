import { readFileSync } from 'fs';
import path from 'path';
import {
  PROFILE_COVER_ICON_BUTTON_SIZE,
  PROFILE_COVER_ICON_GLYPH,
  PROFILE_COVER_ICON_HIT_AREA,
  PROFILE_STICKY_BAR_HEIGHT,
  PROFILE_STICKY_BLUR_RANGE,
  profileStatusBarStyle,
  profileStickyHeaderRanges,
  shouldPinProfileTabs,
} from '@/lib/profileHeader';
import { quickAccessBorderColor } from '@/lib/quickAccessSurface';
import { resolveSarhIconButtonColors } from '@/design-system/components/resolvers';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const layout = src('components/feature/ProfileScreenLayout.tsx');

describe('profile cover: full bleed behind the status bar (X-style)', () => {
  it('screen skips only the top safe-area edge; cover grows by the inset, controls stay below it', () => {
    expect(layout).toContain('<Screen edges={[]} pattern={false}>');
    expect(layout).not.toContain("<Screen edges={['top']}");
    expect(layout).toContain('const insets = useSafeAreaInsets();');
    expect(layout).toContain('{ height: PROFILE_COVER_HEIGHT + insets.top }');
    expect(layout).toContain('{ paddingTop: insets.top, paddingBottom: 0, height: stickyHeight }');
    expect(layout).toContain('progressViewOffset={insets.top}');
  });

  it('cover is never translated by the entrance animation (no gap can open above it)', () => {
    const coverAt = layout.indexOf('testID="profile-cover"');
    const fadeAt = layout.indexOf('<Animated.View style={{ opacity: headerOpacity }}>');
    const riseAt = layout.indexOf('<Animated.View style={{ transform: [{ translateY: headerTranslate }] }}>');
    expect(fadeAt).toBeGreaterThan(-1);
    expect(fadeAt).toBeLessThan(coverAt);
    expect(riseAt).toBeGreaterThan(coverAt);
  });

  it('owns the status bar only while focused, light over a cover photo', () => {
    expect(layout).toContain('{focused ? <StatusBar style={statusBarStyle} /> : null}');
    expect(layout).toContain('useFocusEffect(');
    expect(profileStatusBarStyle({ hasCoverImage: true, isDark: false, tabsPinned: false })).toBe('light');
    // No photo in light mode: the plain band is light, so dark content stays readable.
    expect(profileStatusBarStyle({ hasCoverImage: false, isDark: false, tabsPinned: false })).toBe('dark');
    // Collapsed: the frosted, dark-tinted cover is still behind the status bar → light.
    expect(profileStatusBarStyle({ hasCoverImage: true, isDark: false, tabsPinned: true })).toBe('light');
    expect(profileStatusBarStyle({ hasCoverImage: false, isDark: false, tabsPinned: true })).toBe('dark');
    expect(profileStatusBarStyle({ hasCoverImage: false, isDark: true, tabsPinned: false })).toBe('light');
    expect(profileStatusBarStyle({ hasCoverImage: true, isDark: true, tabsPinned: true })).toBe('light');
  });

  it('sticky tabs pin right under the fixed sticky header', () => {
    expect(shouldPinProfileTabs(0, 400, 47)).toBe(false);
    expect(shouldPinProfileTabs(352, 400, 47)).toBe(false);
    expect(shouldPinProfileTabs(353, 400, 47)).toBe(true);
    expect(shouldPinProfileTabs(900, null, 47)).toBe(false);
    expect(shouldPinProfileTabs(900, 400, 0)).toBe(false);
    expect(layout).toContain('<View onLayout={onTabsLayout} style={styles.tabsBar} testID="profile-tabs-inline">');
    expect(layout).toContain('tabsTopRef.current = event.nativeEvent.layout.y;');
    expect(layout).toContain('shouldPinProfileTabs(y, tabsTopRef.current, stickyHeight)');
    expect(layout).toContain('updateStickyHeader(event);');
    // No ScrollView sticky wrapper (its onLayout y was wrapper-relative → pinned far too early).
    expect(layout).not.toContain('stickyHeaderIndices');
    const pinned = layout.slice(layout.indexOf('testID="profile-tabs-pinned"') - 120);
    expect(pinned).toContain('{ top: stickyHeight }');
    expect(pinned).toContain('<ProfileTabs');
  });
});

describe('profile sticky header: X-style frosted cover', () => {
  it('ranges: cover collapses into the bar, frosts, then the title fades in', () => {
    const r = profileStickyHeaderRanges({ topInset: 54, coverHeight: 112, nameBottom: 400 });
    expect(r.headerHeight).toBe(54 + PROFILE_STICKY_BAR_HEIGHT);
    expect(r.coverFull).toBe(166);
    expect(r.collapseAt).toBe(166 - r.headerHeight);
    expect(r.blurEnd).toBe(r.collapseAt + PROFILE_STICKY_BLUR_RANGE);
    expect(r.titleAt).toBe(400 - r.headerHeight);
    // Unmeasured / very short header: the title never shows before the bar is frosted.
    const early = profileStickyHeaderRanges({ topInset: 54, coverHeight: 112, nameBottom: 120 });
    expect(early.titleAt).toBe(early.blurEnd);
  });

  it('fixed header over the scroll view: blurred cover + DS scrim, theme surface without a cover', () => {
    const at = layout.indexOf('testID="profile-sticky-header"');
    expect(at).toBeGreaterThan(layout.indexOf('</ScreenBody>'));
    const header = layout.slice(at, layout.indexOf('testID="profile-tabs-pinned"'));
    expect(header).toContain('blurRadius={PROFILE_STICKY_BLUR_RADIUS}');
    expect(header).toContain('{ opacity: frostOpacity }');
    expect(header).toContain('styles.stickyTint, { opacity: tintOpacity }');
    expect(header).toContain('top: stickyHeight - sticky.coverFull');
    expect(header).toContain('styles.stickySurface');
    expect(header).toContain('{formatStatCount(user.postsCount)} من المنشورات');
    expect(header).toContain('opacity: titleProgress, transform: [{ translateY: titleTranslate }]');
    expect(layout).toContain('backgroundColor: sarh.color.overlay');
    expect(layout).toContain('const stickyTextColor = hasCover ? sarh.color.fab : themeColors.textPrimary;');
    // Title fade on the native driver; scroll-linked layers follow a native-driven scroll value.
    expect(layout).toMatch(/Animated\.timing\(titleProgress, \{[^}]*useNativeDriver: true/);
    expect(layout).toContain('nativeScrollY={scrollY}');
    expect(layout).not.toContain('scrollY.setValue(');
    // Chrome hide-on-scroll runs once per frame (AppScrollView binds it).
    expect(layout).not.toContain('onChromeScroll');
    const asv = src('components/ui/AppScrollView.tsx');
    expect(asv).toContain("useNativeDriver: Platform.OS !== 'web',");
    expect(asv).toContain('const Scroller = nativeScrollY ? Animated.ScrollView : ScrollView;');
    expect(src('design-system/layout/ScreenBody.tsx')).toContain('nativeScrollY={nativeScrollY}');
    expect(layout).not.toContain('expo-blur');
    expect(layout).not.toContain('reanimated');
  });
});

describe('profile cover controls: glass, one step smaller', () => {
  it('back / more / settings are round glass circles with a ≥44pt hit area', () => {
    expect(PROFILE_COVER_ICON_BUTTON_SIZE).toBe(36);
    expect(PROFILE_COVER_ICON_GLYPH).toBe(18);
    expect(PROFILE_COVER_ICON_HIT_AREA).toBeGreaterThanOrEqual(44);
    // One set of controls, in the fixed sticky header (no duplicate compact bar any more).
    expect(layout.match(/chrome="glass"/g)).toHaveLength(3);
    expect(layout.match(/iconSize=\{PROFILE_COVER_ICON_GLYPH\}/g)).toHaveLength(1);
    expect(layout.match(/iconSize=\{PROFILE_COVER_NAV_GLYPH\}/g)).toHaveLength(2);
    expect(layout).not.toContain('testID="profile-compact-bar"');
    expect(layout.match(/style=\{styles\.coverIcon\}/g)).toHaveLength(3);
    const block = layout.slice(layout.indexOf('    coverIcon: {'), layout.indexOf('\n    },', layout.indexOf('    coverIcon: {')));
    expect(block).toContain('borderRadius: PROFILE_COVER_ICON_BUTTON_SIZE / 2');
    expect(block).toContain('minWidth: PROFILE_COVER_ICON_BUTTON_SIZE');
    expect(block).toContain('borderColor: glass.borderColor');
    expect(block).not.toMatch(/shadow|elevation|backgroundColor/);
    // Glass = translucent fill + white glyph (no solid squares, no blur lib).
    const glass = resolveSarhIconButtonColors('default', 'glass');
    expect(glass.backgroundColor).toMatch(/^rgba\(/);
    expect(glass.contentColor).toBe('rgb(255, 255, 255)');
    expect(layout).not.toContain('expo-blur');
  });

  it('DS icon buttons accept an optional glyph size (default unchanged)', () => {
    for (const rel of ['design-system/components/SarhIconButton.tsx', 'design-system/components/SarhBackButton.tsx']) {
      expect(src(rel)).toContain('iconSize ?? metrics.icon');
    }
  });
});

describe('profile pills: quick-access border (colour only)', () => {
  it('share / edit (and visitor outline pills) use the quick-access hairline', () => {
    expect(quickAccessBorderColor('dark')).toBe('#2F3336');
    expect(quickAccessBorderColor('light')).toBe('#E6E8EB');
    expect(layout).toContain('borderColor: quickAccessBorderColor(scheme)');
    // Share + Edit (own) and Message (visitor) outline pills; Follow only outlined when following.
    expect(layout.match(/style=\{\[styles\.pill, styles\.pillBorder\]\}/g)).toHaveLength(3);
    expect(layout).toContain('style={[styles.pill, isFollowing ? styles.pillBorder : null]}');
    const block = layout.slice(layout.indexOf('    pillBorder: {'), layout.indexOf('\n    },', layout.indexOf('    pillBorder: {')));
    expect(block).not.toMatch(/height|width|padding|radius/i);
    // The shared DS secondary variant is untouched.
    expect(src('design-system/components/SarhButton.tsx')).not.toContain('quickAccessBorderColor');
  });
});
