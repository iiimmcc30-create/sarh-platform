/**
 * Swipe tab pager (Profile / Search / Community): offset -> index -> indicator
 * position in LTR, native RTL and web RTL, plus wiring guards.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { bookmarkPagerIndex, bookmarkPagerOffset } from '@/lib/bookmarks';
import {
  isTabPagerAligned,
  resolveSwipeIndexForMode,
  resolveTabPagerMode,
  revealTabOffset,
  tabIndicatorAt,
  tabIndicatorFrame,
  tabIndicatorInterpolation,
  tabPagerIndex,
  tabPagerIndexForMode,
  tabPagerOffset,
  tabPagerOffsetForMode,
  tabPagerProgress,
  tabPagerProgressRange,
  type TabLayout,
  type TabPagerMode,
} from '@/lib/tabPager';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const W = 400;
const MODES: TabPagerMode[] = ['ltr', 'rtl-native', 'rtl-web'];

/** Linear interpolation exactly as Animated.interpolate (clamped) evaluates it. */
function interpolate(value: number, inputRange: number[], outputRange: number[]): number {
  const last = inputRange.length - 1;
  if (value <= inputRange[0]) return outputRange[0];
  if (value >= inputRange[last]) return outputRange[last];
  let i = 0;
  while (i < last - 1 && value > inputRange[i + 1]) i += 1;
  const t = (value - inputRange[i]) / (inputRange[i + 1] - inputRange[i]);
  return outputRange[i] + (outputRange[i + 1] - outputRange[i]) * t;
}

/** Three tabs of different label widths laid out RTL: tab 0 on the right. */
const RTL_TABS: TabLayout[] = [
  { x: 260, y: 0, width: 140, height: 44 }, // المنشورات
  { x: 140, y: 0, width: 120, height: 44 }, // الإعلانات
  { x: 0, y: 0, width: 140, height: 44 }, // الردود
];
const LTR_TABS: TabLayout[] = [
  { x: 0, y: 0, width: 140, height: 44 },
  { x: 140, y: 0, width: 120, height: 44 },
  { x: 260, y: 0, width: 140, height: 44 },
];

describe('pager mode', () => {
  it('web RTL scrolls in negative scrollLeft; native RTL keeps physical offsets', () => {
    expect(resolveTabPagerMode(false, 'ios')).toBe('ltr');
    expect(resolveTabPagerMode(false, 'web')).toBe('ltr');
    expect(resolveTabPagerMode(true, 'ios')).toBe('rtl-native');
    expect(resolveTabPagerMode(true, 'android')).toBe('rtl-native');
    expect(resolveTabPagerMode(true, 'web')).toBe('rtl-web');
  });

  it('native modes are exactly the /bookmarks math (bookmarks behaviour unchanged)', () => {
    expect(bookmarkPagerOffset).toBe(tabPagerOffset);
    expect(bookmarkPagerIndex).toBe(tabPagerIndex);
    for (let i = 0; i < 3; i += 1) {
      expect(tabPagerOffsetForMode(i, W, 3, 'rtl-native')).toBe(tabPagerOffset(i, W, 3, true));
      expect(tabPagerOffsetForMode(i, W, 3, 'ltr')).toBe(tabPagerOffset(i, W, 3, false));
    }
  });
});

describe('offset <-> index', () => {
  it('maps pages to physical offsets per mode', () => {
    expect([0, 1, 2].map((i) => tabPagerOffsetForMode(i, W, 3, 'ltr'))).toEqual([0, 400, 800]);
    expect([0, 1, 2].map((i) => tabPagerOffsetForMode(i, W, 3, 'rtl-native'))).toEqual([800, 400, 0]);
    expect([0, 1, 2].map((i) => tabPagerOffsetForMode(i, W, 3, 'rtl-web'))).toEqual([0, -400, -800]);
  });

  it('round-trips every page in every mode and page count', () => {
    for (const mode of MODES) {
      for (const count of [1, 2, 3, 5, 6]) {
        for (let i = 0; i < count; i += 1) {
          expect(tabPagerIndexForMode(tabPagerOffsetForMode(i, W, count, mode), W, count, mode)).toBe(i);
        }
      }
    }
  });

  it('web RTL: the old native formula picked the mirrored tab (regression)', () => {
    // Resting on the first page (scrollLeft 0) with 3 tabs:
    expect(tabPagerIndex(0, W, 3, true)).toBe(2); // old: "الردود"
    expect(tabPagerIndexForMode(0, W, 3, 'rtl-web')).toBe(0); // fixed: "المنشورات"
    expect(tabPagerIndexForMode(-800, W, 3, 'rtl-web')).toBe(2);
    // Old tap target for page 2 was +0 / page 0 was +800: the browser clamps a
    // positive scrollLeft to 0 in RTL, so taps never moved the web pager.
    expect(tabPagerOffset(0, W, 3, true)).toBe(800);
    expect(tabPagerOffsetForMode(0, W, 3, 'rtl-web')).toBe(0);
  });

  it('rounds half-dragged offsets to the nearest page and clamps overscroll', () => {
    expect(tabPagerIndexForMode(190, W, 3, 'ltr')).toBe(0);
    expect(tabPagerIndexForMode(210, W, 3, 'ltr')).toBe(1);
    expect(tabPagerIndexForMode(610, W, 3, 'rtl-native')).toBe(0);
    expect(tabPagerIndexForMode(-610, W, 3, 'rtl-web')).toBe(2);
    expect(tabPagerIndexForMode(5000, W, 3, 'ltr')).toBe(2);
    expect(tabPagerIndexForMode(-50, W, 3, 'ltr')).toBe(0);
  });

  it('detects a settled (page-aligned) offset for web, where momentum end never fires', () => {
    for (const mode of MODES) {
      for (let i = 0; i < 3; i += 1) {
        expect(isTabPagerAligned(tabPagerOffsetForMode(i, W, 3, mode), W, 3, mode)).toBe(true);
      }
    }
    expect(isTabPagerAligned(-399.6, W, 3, 'rtl-web')).toBe(true);
    expect(isTabPagerAligned(-250, W, 3, 'rtl-web')).toBe(false);
    expect(isTabPagerAligned(Number.NaN, W, 3, 'ltr')).toBe(false);
  });

  it('a settled swipe selects once, a snap-back selects nothing, a veto snaps back', () => {
    expect(resolveSwipeIndexForMode(-400, W, 3, 'rtl-web', 0)).toEqual({ next: 1, vetoed: false });
    expect(resolveSwipeIndexForMode(0, W, 3, 'rtl-web', 0)).toEqual({ next: null, vetoed: false });
    expect(resolveSwipeIndexForMode(0, W, 2, 'rtl-native', 0, (i) => i !== 1)).toEqual({
      next: null,
      vetoed: true,
    });
  });
});

describe('progress (drives the indicator while dragging)', () => {
  it('is 0 .. count-1 across the drag, in the logical direction for every mode', () => {
    for (const mode of MODES) {
      const range = tabPagerProgressRange(W, 3, mode);
      for (let i = 0; i < 3; i += 1) {
        const x = tabPagerOffsetForMode(i, W, 3, mode);
        expect(interpolate(x, range.inputRange, range.outputRange)).toBeCloseTo(i, 6);
        expect(tabPagerProgress(x, W, 3, mode)).toBeCloseTo(i, 6);
      }
      // Halfway between page 0 and page 1.
      const mid = (tabPagerOffsetForMode(0, W, 3, mode) + tabPagerOffsetForMode(1, W, 3, mode)) / 2;
      expect(interpolate(mid, range.inputRange, range.outputRange)).toBeCloseTo(0.5, 6);
      expect(tabPagerProgress(mid, W, 3, mode)).toBeCloseTo(0.5, 6);
      // Animated requires an ascending input range.
      expect(range.inputRange[1]).toBeGreaterThan(range.inputRange[0]);
    }
  });

  it('never divides by zero for a single page', () => {
    const range = tabPagerProgressRange(W, 1, 'rtl-web');
    expect(range.inputRange[1]).toBeGreaterThan(range.inputRange[0]);
    expect(tabPagerProgress(123, W, 1, 'ltr')).toBe(0);
  });
});

describe('indicator position (measured tabs, different widths)', () => {
  it('sits exactly under the active tab at rest: offset -> index -> indicator', () => {
    const cases: [TabPagerMode, TabLayout[]][] = [
      ['ltr', LTR_TABS],
      ['rtl-native', RTL_TABS],
      ['rtl-web', RTL_TABS],
    ];
    for (const [mode, tabs] of cases) {
      const interp = tabIndicatorInterpolation(tabs, 3, { inset: 12 })!;
      for (let i = 0; i < 3; i += 1) {
        const x = tabPagerOffsetForMode(i, W, 3, mode);
        const index = tabPagerIndexForMode(x, W, 3, mode);
        const progress = tabPagerProgress(x, W, 3, mode);
        expect(index).toBe(i);
        const frame = tabIndicatorFrame(tabs[index], { inset: 12 });
        expect(interpolate(progress, interp.inputRange, interp.translateX)).toBeCloseTo(frame.x, 6);
        expect(interpolate(progress, interp.inputRange, interp.width)).toBeCloseTo(frame.width, 6);
        expect(tabIndicatorAt(progress, tabs, 3, { inset: 12 })).toEqual(frame);
      }
    }
  });

  it('RTL: moves LEFT as you advance (never mirrored); LTR moves right', () => {
    const rtlStart = tabIndicatorAt(0, RTL_TABS, 3)!.x;
    const rtlMid = tabIndicatorAt(0.5, RTL_TABS, 3)!.x;
    const rtlNext = tabIndicatorAt(1, RTL_TABS, 3)!.x;
    expect(rtlMid).toBeLessThan(rtlStart);
    expect(rtlNext).toBeLessThan(rtlMid);
    expect(tabIndicatorAt(1, LTR_TABS, 3)!.x).toBeGreaterThan(tabIndicatorAt(0, LTR_TABS, 3)!.x);
  });

  it('slides and resizes continuously between tabs of different widths (no jump)', () => {
    const tabs = RTL_TABS;
    let prev = tabIndicatorAt(0, tabs, 3)!;
    for (let p = 0.05; p <= 2.0001; p += 0.05) {
      const cur = tabIndicatorAt(p, tabs, 3)!;
      expect(Math.abs(cur.x - prev.x)).toBeLessThanOrEqual(7.01);
      expect(Math.abs(cur.width - prev.width)).toBeLessThanOrEqual(1.01);
      prev = cur;
    }
    // Half-way: between the two measured frames.
    const half = tabIndicatorAt(0.5, tabs, 3)!;
    expect(half.width).toBeCloseTo((140 + 120) / 2, 6);
  });

  it('fixed-width underline is centred under each tab (search result tabs)', () => {
    expect(tabIndicatorFrame({ x: 100, y: 0, width: 80, height: 40 }, { fixedWidth: 22 })).toEqual({
      x: 129,
      width: 22,
    });
    const interp = tabIndicatorInterpolation(RTL_TABS, 3, { fixedWidth: 22 })!;
    expect(interp.width).toEqual([22, 22, 22]);
    expect(interp.translateX).toEqual([319, 189, 59]);
    expect(interp.top).toBe(44); // indicator bottom = tab bottom
  });

  it('waits for every tab to be measured', () => {
    expect(tabIndicatorInterpolation([RTL_TABS[0], undefined, RTL_TABS[2]], 3)).toBeNull();
    expect(tabIndicatorInterpolation(RTL_TABS.slice(0, 2), 3)).toBeNull();
    const single = tabIndicatorInterpolation([LTR_TABS[0]], 1)!;
    expect(single.inputRange).toEqual([0, 1]);
  });
});

describe('scrolling tab rows keep the selected tab visible', () => {
  const base = { tabWidth: 80, contentWidth: 600, viewportWidth: 360, margin: 16 };
  it('LTR / native: scrolls just enough, keeps a visible tab where it is', () => {
    expect(revealTabOffset({ ...base, tabX: 500, currentOffset: 0, mode: 'ltr' })).toBe(236);
    expect(revealTabOffset({ ...base, tabX: 100, currentOffset: 0, mode: 'ltr' })).toBe(0);
    expect(revealTabOffset({ ...base, tabX: 0, currentOffset: 200, mode: 'rtl-native' })).toBe(0);
  });
  it('web RTL: negative scrollLeft (0 = right end)', () => {
    // Row scrolled to its right end (0); the left-most tab needs the full -maxScroll.
    expect(revealTabOffset({ ...base, tabX: 0, currentOffset: 0, mode: 'rtl-web' })).toBe(-240);
    // A tab already visible on the right keeps the row still.
    expect(revealTabOffset({ ...base, tabX: 450, currentOffset: 0, mode: 'rtl-web' })).toBe(0);
    // Content fits: nothing to scroll.
    expect(revealTabOffset({ ...base, contentWidth: 300, tabX: 0, currentOffset: 0, mode: 'rtl-web' })).toBe(0);
  });
});

describe('wiring', () => {
  const hook = src('hooks/useSwipeTabPager.ts');
  const indicator = src('components/ui/SwipeTabIndicator.tsx');
  const profileTabs = src('components/feature/ProfileTabs.tsx');
  const layout = src('components/feature/ProfileScreenLayout.tsx');
  const search = src('app/search.tsx');
  const layoutsHook = src('hooks/useTabLayouts.ts');

  it('hook: platform-aware offsets, continuous progress, web settle, cleanup', () => {
    expect(hook).toContain('const mode = resolveTabPagerMode(rtl, Platform.OS);');
    expect(hook).toContain('tabPagerProgressRange(width, count, mode)');
    expect(hook).toContain('Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }]');
    expect(hook).toContain('scrollX.addListener');
    expect(hook).toContain('scrollX.removeListener(id)');
    expect(hook).toContain('isTabPagerAligned(value, w, count, mode)');
    expect(hook).toContain('WEB_SETTLE_MS');
    expect(hook).toContain('cancelAnimationFrame(frame)');
    // Height changes never yank the pager mid-swipe; only width / remount re-align.
    expect(hook).toContain('if (remounted) positionPager();');
    expect(hook).not.toMatch(/onboarding|unifiedSearch|fetch\(/);
  });

  it('one sliding indicator, LTR track so translateX is physical', () => {
    expect(indicator).toContain("direction: 'ltr'");
    expect(indicator).toContain('left: 0,\n    right: 0,');
    expect(indicator).toContain('transform: [{ translateX: animated.translateX }]');
    expect(indicator).toContain("extrapolate: 'clamp'");
    expect(layoutsHook).toContain('export function useTabLayouts');
    expect(layoutsHook).toContain('export function useRevealActiveTab');
  });

  it('Profile tabs: measured tabs + pager progress, per-tab fade only as fallback', () => {
    expect(layout).toContain('progress={tabPager.progress}');
    expect(profileTabs).toContain('<SwipeTabIndicator');
    expect(profileTabs).toContain('onLayout={(event) => onTabLayout(i, event)}');
    expect(profileTabs).toContain('showOwnIndicator={!progress}');
    expect(profileTabs).toContain('inset={spacing.md}');
  });

  it('Search result tabs: measured tabs + pager progress, 22px underline, reveal', () => {
    expect(search).toContain('progress={resultPager.progress}');
    expect(search).toContain('onLayout={(event) => onResultTabLayout(index, event)}');
    expect(search).toContain('fixedWidth={RESULT_TAB_INDICATOR_WIDTH}');
    expect(search).toContain('const RESULT_TAB_INDICATOR_WIDTH = 22;');
    expect(search).toContain('scrollRef={resultTabsRef}');
    expect(search).not.toContain('styles.resultTabIndicator');
  });

  it('RN Animated only', () => {
    for (const text of [hook, indicator, profileTabs, layoutsHook, src('lib/tabPager.ts')]) {
      expect(text).not.toMatch(/react-native-reanimated|react-native-pager-view|react-native-gesture-handler/);
    }
  });
});
