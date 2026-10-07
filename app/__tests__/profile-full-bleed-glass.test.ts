import { readFileSync } from 'fs';
import path from 'path';
import {
  PROFILE_COVER_ICON_BUTTON_SIZE,
  PROFILE_COVER_ICON_GLYPH,
  PROFILE_COVER_ICON_HIT_AREA,
  profileStatusBarStyle,
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
    expect(layout).toContain('{ paddingTop: spacing.xs + insets.top }');
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
    expect(profileStatusBarStyle({ hasCoverImage: true, isDark: false, tabsPinned: true })).toBe('dark');
    expect(profileStatusBarStyle({ hasCoverImage: false, isDark: true, tabsPinned: false })).toBe('light');
    expect(profileStatusBarStyle({ hasCoverImage: true, isDark: true, tabsPinned: true })).toBe('light');
  });

  it('sticky tabs pin below the status bar with a top-inset spacer', () => {
    expect(shouldPinProfileTabs(0, 400, 47)).toBe(false);
    expect(shouldPinProfileTabs(352, 400, 47)).toBe(false);
    expect(shouldPinProfileTabs(353, 400, 47)).toBe(true);
    expect(shouldPinProfileTabs(900, null, 47)).toBe(false);
    expect(shouldPinProfileTabs(900, 400, 0)).toBe(false);
    expect(layout).toContain('onLayout={onTabsLayout}');
    expect(layout).toContain('tabsPinned ? { marginTop: spacing.md - insets.top, paddingTop: insets.top } : null');
    expect(layout).toContain('updateTabsPinned(event);');
  });
});

describe('profile cover controls: glass, one step smaller', () => {
  it('back / more / settings are round glass circles with a ≥44pt hit area', () => {
    expect(PROFILE_COVER_ICON_BUTTON_SIZE).toBe(36);
    expect(PROFILE_COVER_ICON_GLYPH).toBe(18);
    expect(PROFILE_COVER_ICON_HIT_AREA).toBeGreaterThanOrEqual(44);
    expect(layout.match(/chrome="glass"/g)).toHaveLength(3);
    expect(layout.match(/iconSize=\{PROFILE_COVER_ICON_GLYPH\}/g)).toHaveLength(3);
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
    expect(layout.match(/style=\{\[styles\.pill, styles\.pillBorder\]\}/g)).toHaveLength(2);
    expect(layout).toContain('style={[styles.actionBtnFlex, styles.pillBorder]}');
    expect(layout).toContain('style={[styles.actionBtnFlex, isFollowing ? styles.pillBorder : null]}');
    const block = layout.slice(layout.indexOf('    pillBorder: {'), layout.indexOf('\n    },', layout.indexOf('    pillBorder: {')));
    expect(block).not.toMatch(/height|width|padding|radius/i);
    // The shared DS secondary variant is untouched.
    expect(src('design-system/components/SarhButton.tsx')).not.toContain('quickAccessBorderColor');
  });
});
