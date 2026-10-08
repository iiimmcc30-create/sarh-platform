import { getProfileTabs, profileTabRevealRange, profileTabTrack } from '@/lib/profileTabs';
import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('profile tabs: X-style icons, label beside the selected tab only', () => {
  const tabs = src('components/feature/ProfileTabs.tsx');

  it('every tab has an icon from the app line set; same order and keys', () => {
    const own = getProfileTabs(true);
    expect(own.map((t) => [t.key, t.icon, t.activeStyle])).toEqual([
      ['posts', 'document-text', 'bold'],
      ['ads', 'pricetag', 'fill'],
      ['replies', 'chatbubble-ellipses-outline', 'fill'],
      ['reposts', 'repeat-2', 'bold'],
      ['likes', 'heart', 'fill'],
    ]);
    expect(own.map((t) => t.label)).toEqual(['المنشورات', 'الإعلانات', 'الردود', 'إعادة النشر', 'الإعجابات']);
    expect(getProfileTabs(false).map((t) => t.key)).toEqual(['posts', 'ads', 'replies', 'reposts']);
  });

  it('icon always rendered; selected = filled / bold accent, idle = textSecondary outline (crossfaded)', () => {
    expect(tabs).toContain('<AppIcon');
    expect(tabs).toContain('color={colors.electric}');
    expect(tabs).toContain('color={colors.textSecondary} variant="rr"');
    expect(tabs).toContain("variant={tab.activeStyle === 'fill' ? 'sr' : 'rr'}");
    expect(tabs).toContain('opacity: m.hidden');
    expect(tabs).toContain('opacity: m.shown');
  });

  it('label reveal is transform + opacity only (native driver), Arabic accessibilityLabel', () => {
    expect(tabs).toContain('PROFILE_TAB_REVEAL_MS = duration.ui');
    expect(tabs).toContain("const NATIVE_DRIVER = Platform.OS !== 'web';");
    expect(tabs).toContain('useNativeDriver: NATIVE_DRIVER');
    expect(tabs).toContain('transform: [{ translateX: m.labelX }]');
    expect(tabs).not.toContain('useNativeDriver: false');
    expect(tabs).toContain('accessibilityLabel={tab.label}');
    expect(tabs).toContain('accessibilityRole="tab"');
    expect(tabs).toContain('minWidth: PROFILE_TAB_MIN_TOUCH');
    expect(tabs).toContain('export const ProfileTabs = memo(');
    expect(tabs).not.toMatch(/reanimated|LinearGradient|shadowColor|elevation/);
  });

  it('keeps the bar height (12 + 20 + 10) and one underline', () => {
    expect(tabs).toContain('paddingTop: 12,');
    expect(tabs).toContain('paddingBottom: 10,');
    expect(tabs).toContain('PROFILE_TAB_ROW_HEIGHT = 20');
    expect(tabs).toContain('height: HEADER_TAB_INDICATOR_THICKNESS,');
  });
});

describe('profile tab track (frames computed once, interpolated by progress)', () => {
  const base = { iconSize: 20, gap: 6, baseWidth: 44, inset: 12 };
  const labels = [60, 50, 40];

  it('LTR: selected slot grows by gap + label, spare space shared evenly, slots fill the row', () => {
    const track = profileTabTrack(3, { ...base, rowWidth: 300, labelWidths: labels, rtl: false })!;
    expect(track.inputRange).toEqual([0, 1, 2]);
    // k = 0: natural 110 + 44 + 44 = 198, extra 34 each.
    expect(track.widthsAt[0]).toEqual([144, 78, 78]);
    for (const widths of track.widthsAt) {
      expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(300);
      for (const w of widths) expect(w).toBeGreaterThanOrEqual(44);
    }
    // Selected tab 0 (x 0..144, centre 72): group 20 + 6 + 60 = 86 -> icon at 29, label at 55.
    expect(track.iconX[0][0]).toBe(29);
    expect(track.labelX[0][0]).toBe(55);
    // Idle tab 1 (x 144..222): icon centred.
    expect(track.iconX[1][0]).toBe(173);
    expect(track.indicatorCenter[0]).toBe(72);
    expect(track.indicatorWidth[0]).toBe(120);
  });

  it('RTL: tab 0 on the right, icon at the inline start (right) and the label to its left', () => {
    const track = profileTabTrack(3, { ...base, rowWidth: 300, labelWidths: labels, rtl: true })!;
    // Tab 0 spans 156..300 (centre 228): group 86 -> icon 251..271, label 185..245.
    expect(track.iconX[0][0]).toBe(251);
    expect(track.labelX[0][0]).toBe(185);
    expect(track.indicatorCenter[0]).toBe(228);
    // Selecting the last tab moves the underline to the left edge.
    expect(track.indicatorCenter[2]).toBeLessThan(track.indicatorCenter[0]);
  });

  it('too narrow: shrinks proportionally instead of overflowing; waits for a width', () => {
    const track = profileTabTrack(5, { ...base, rowWidth: 200, labelWidths: [80, 80, 80, 80, 80], rtl: false })!;
    expect(track.widthsAt[0].reduce((a, b) => a + b, 0)).toBeCloseTo(200);
    expect(profileTabTrack(3, { ...base, rowWidth: 0, labelWidths: labels, rtl: false })).toBeNull();
    expect(profileTabTrack(1, { ...base, rowWidth: 100, labelWidths: [40], rtl: false })!.inputRange).toEqual([0, 1]);
  });

  it('label / selected glyph visible only around its own index', () => {
    expect(profileTabRevealRange(2)).toEqual({ inputRange: [1.5, 2, 2.5], outputRange: [0, 1, 0] });
  });
});
