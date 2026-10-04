/**
 * Shared swipe-tab pager math (extracted verbatim from the /bookmarks pager, see
 * lib/bookmarks re-exports). Pure helpers, no RN imports.
 *
 * RTL-aware: in RTL, Yoga lays page 0 out on the RIGHT, but native
 * contentOffset.x / scrollTo({ x }) stay physical (from the left). So in RTL
 * page `i` sits at physical offset (count - 1 - i) * width. Tabs, indicator and
 * visible content all derive from one index through these two functions.
 */

/**
 * Header tab underline (Feed «لك / متابعة», Search tabs, Profile): an X-style
 * bar that sits flush on the header's bottom edge and spans the tab label.
 */
export const HEADER_TAB_INDICATOR_THICKNESS = 3;
/** How far the header underline overhangs the tab label on each side. */
export const HEADER_TAB_INDICATOR_OVERHANG = 8;
export function tabPagerOffset(index: number, pageWidth: number, count: number, rtl: boolean): number {
  if (count <= 0 || !(pageWidth > 0) || !Number.isFinite(index)) return 0;
  const safe = Math.min(Math.max(0, Math.round(index)), count - 1);
  return (rtl ? count - 1 - safe : safe) * pageWidth;
}

export function tabPagerIndex(offsetX: number, pageWidth: number, count: number, rtl: boolean): number {
  if (count <= 0 || !(pageWidth > 0) || !Number.isFinite(offsetX)) return 0;
  const physical = Math.min(Math.max(0, Math.round(Math.abs(offsetX) / pageWidth)), count - 1);
  return rtl ? count - 1 - physical : physical;
}

/** Clamp a tab index into [0, count - 1] (0 when empty). */
export function clampTabIndex(index: number, count: number): number {
  if (count <= 0 || !Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.round(index)), count - 1);
}

/**
 * Settled swipe -> next index. Returns `null` when nothing changes (same page),
 * so a swipe that snaps back never re-selects the tab (no refetch / no effect).
 * `canSelect` can veto a page (e.g. a signed-out "following" feed); the caller
 * then snaps the pager back to `current`.
 */
export function resolveSwipeIndex(
  offsetX: number,
  pageWidth: number,
  count: number,
  rtl: boolean,
  current: number,
  canSelect?: (index: number) => boolean,
): { next: number | null; vetoed: boolean } {
  const target = tabPagerIndex(offsetX, pageWidth, count, rtl);
  if (target === current) return { next: null, vetoed: false };
  if (canSelect && !canSelect(target)) return { next: null, vetoed: true };
  return { next: target, vetoed: false };
}

/** Pages rendered by a content-height pager: the active page and its neighbours. */
export function isTabPageNear(page: number, index: number): boolean {
  return Math.abs(page - index) <= 1;
}
/* -------------------------------------------------------------------------- */
/* Platform-aware paging (continuous progress + drag-tracking indicator).      */
/* -------------------------------------------------------------------------- */

/**
 * Physical scroll model of a horizontal paging ScrollView:
 *
 * - `ltr`        page i at  i * width (from the left).
 * - `rtl-native` Yoga lays page 0 on the RIGHT; native offsets stay physical
 *                from the left -> page i at (count - 1 - i) * width
 *                (= tabPagerOffset(i, w, n, true), unchanged for /bookmarks).
 * - `rtl-web`    a CSS `direction: rtl` scroller starts at scrollLeft 0 on the
 *                right and goes NEGATIVE to the left (react-native-web passes
 *                scrollLeft through) -> page i at -i * width. The app patches
 *                I18nManager.isRTL = true on web, so the native formula there
 *                targets positive offsets the browser clamps to 0.
 */
export type TabPagerMode = 'ltr' | 'rtl-native' | 'rtl-web';

export function resolveTabPagerMode(rtl: boolean, platformOS: string): TabPagerMode {
  if (!rtl) return 'ltr';
  return platformOS === 'web' ? 'rtl-web' : 'rtl-native';
}

export function tabPagerOffsetForMode(index: number, width: number, count: number, mode: TabPagerMode): number {
  if (count <= 0 || !(width > 0)) return 0;
  const safe = clampTabIndex(index, count);
  if (mode === 'rtl-web') return safe === 0 ? 0 : -safe * width;
  return tabPagerOffset(safe, width, count, mode === 'rtl-native');
}

export function tabPagerIndexForMode(offsetX: number, width: number, count: number, mode: TabPagerMode): number {
  // rtl-web: |scrollLeft| already counts pages from the start (right) edge.
  if (mode === 'rtl-web') return tabPagerIndex(offsetX, width, count, false);
  return tabPagerIndex(offsetX, width, count, mode === 'rtl-native');
}

/** Settled swipe (mode-aware) -> next index; same contract as resolveSwipeIndex. */
export function resolveSwipeIndexForMode(
  offsetX: number,
  width: number,
  count: number,
  mode: TabPagerMode,
  current: number,
  canSelect?: (index: number) => boolean,
): { next: number | null; vetoed: boolean } {
  const target = tabPagerIndexForMode(offsetX, width, count, mode);
  if (target === current) return { next: null, vetoed: false };
  if (canSelect && !canSelect(target)) return { next: null, vetoed: true };
  return { next: target, vetoed: false };
}

/** True when the offset rests on a page (within `tolerance` px): a settled pager. */
export function isTabPagerAligned(
  offsetX: number,
  width: number,
  count: number,
  mode: TabPagerMode,
  tolerance = 1,
): boolean {
  if (count <= 0 || !(width > 0) || !Number.isFinite(offsetX)) return false;
  const page = tabPagerIndexForMode(offsetX, width, count, mode);
  return Math.abs(offsetX - tabPagerOffsetForMode(page, width, count, mode)) <= tolerance;
}

/**
 * Physical offset -> logical progress (0 .. count - 1) for Animated.interpolate.
 * Input range ascending, as RN requires; a single page still yields 2 points.
 */
export function tabPagerProgressRange(
  width: number,
  count: number,
  mode: TabPagerMode,
): { inputRange: number[]; outputRange: number[] } {
  const w = width > 0 ? width : 1;
  const last = Math.max(0, count - 1);
  const span = Math.max(last * w, 1);
  if (mode === 'rtl-native') return { inputRange: [0, span], outputRange: [last, 0] };
  if (mode === 'rtl-web') return { inputRange: [-span, 0], outputRange: [last, 0] };
  return { inputRange: [0, span], outputRange: [0, last] };
}

/** Linear progress for an offset (same mapping as tabPagerProgressRange, clamped). */
export function tabPagerProgress(offsetX: number, width: number, count: number, mode: TabPagerMode): number {
  if (count <= 1 || !(width > 0) || !Number.isFinite(offsetX)) return 0;
  const last = count - 1;
  const raw = mode === 'rtl-native' ? last - offsetX / width : mode === 'rtl-web' ? -offsetX / width : offsetX / width;
  return Math.min(Math.max(raw, 0), last);
}

/** A tab's measured frame (onLayout, physical px from its row's left edge). */
export type TabLayout = { x: number; y: number; width: number; height: number };

export type TabIndicatorOptions = {
  /** Fixed-width indicator centred under the tab (e.g. a short underline). */
  fixedWidth?: number;
  /** Otherwise the tab width minus this inset on each side. */
  inset?: number;
};

/** Indicator frame under one tab: physical left `x` and `width`. */
export function tabIndicatorFrame(layout: TabLayout, options: TabIndicatorOptions = {}): { x: number; width: number } {
  if (options.fixedWidth != null && options.fixedWidth > 0) {
    const width = Math.min(options.fixedWidth, Math.max(0, layout.width));
    return { x: layout.x + (layout.width - width) / 2, width };
  }
  const inset = Math.max(0, options.inset ?? 0);
  const width = Math.max(0, layout.width - inset * 2);
  return { x: layout.x + (layout.width - width) / 2, width };
}

/**
 * Indicator interpolation keyed by logical progress (0 .. count - 1): at an
 * integer progress `i` the indicator sits exactly under tab `i` (measured x /
 * width, so labels of different widths never make it jump), and in between it
 * slides + resizes with the drag. `null` until every tab has been measured.
 */
export function tabIndicatorInterpolation(
  layouts: readonly (TabLayout | undefined)[],
  count: number,
  options: TabIndicatorOptions = {},
): { inputRange: number[]; translateX: number[]; width: number[]; top: number } | null {
  if (count <= 0 || layouts.length < count) return null;
  const inputRange: number[] = [];
  const translateX: number[] = [];
  const width: number[] = [];
  let bottom = 0;
  for (let i = 0; i < count; i += 1) {
    const layout = layouts[i];
    if (!layout || !(layout.width > 0)) return null;
    const frame = tabIndicatorFrame(layout, options);
    inputRange.push(i);
    translateX.push(frame.x);
    width.push(frame.width);
    bottom = Math.max(bottom, layout.y + layout.height);
  }
  if (count === 1) {
    inputRange.push(1);
    translateX.push(translateX[0]);
    width.push(width[0]);
  }
  return { inputRange, translateX, width, top: bottom };
}

/** Indicator frame at a given progress (what the interpolation renders). */
export function tabIndicatorAt(
  progress: number,
  layouts: readonly (TabLayout | undefined)[],
  count: number,
  options: TabIndicatorOptions = {},
): { x: number; width: number } | null {
  const interp = tabIndicatorInterpolation(layouts, count, options);
  if (!interp) return null;
  const last = interp.inputRange.length - 1;
  const p = Math.min(Math.max(progress, 0), interp.inputRange[last]);
  const i = Math.min(Math.floor(p), last - 1);
  const t = p - i;
  const lerp = (a: number[]) => a[i] + (a[i + 1] - a[i]) * t;
  return { x: lerp(interp.translateX), width: lerp(interp.width) };
}

/**
 * Scroll offset that brings a tab fully into view inside a horizontally
 * scrolling tab row (keeps the current offset when it is already visible).
 * `tabX` is physical from the content's left edge; the returned offset follows
 * the row's scroll model (`rtl-web` rows scroll in negative scrollLeft).
 */
export function revealTabOffset(params: {
  tabX: number;
  tabWidth: number;
  contentWidth: number;
  viewportWidth: number;
  currentOffset: number;
  mode: TabPagerMode;
  margin?: number;
}): number {
  const { tabX, tabWidth, contentWidth, viewportWidth, currentOffset, mode } = params;
  const margin = Math.max(0, params.margin ?? 16);
  const maxScroll = Math.max(0, contentWidth - viewportWidth);
  if (!(viewportWidth > 0) || maxScroll <= 0) return mode === 'rtl-web' ? 0 : currentOffset;
  // Work in "physical left" space: 0 .. maxScroll = distance scrolled from the left edge.
  const physical = mode === 'rtl-web' ? maxScroll + currentOffset : currentOffset;
  let next = physical;
  if (tabX - margin < physical) next = tabX - margin;
  else if (tabX + tabWidth + margin > physical + viewportWidth) next = tabX + tabWidth + margin - viewportWidth;
  next = Math.min(Math.max(next, 0), maxScroll);
  return mode === 'rtl-web' ? next - maxScroll : next;
}
