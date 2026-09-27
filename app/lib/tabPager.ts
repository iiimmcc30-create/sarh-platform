/**
 * Shared swipe-tab pager math (extracted verbatim from the /bookmarks pager, see
 * lib/bookmarks re-exports). Pure helpers, no RN imports.
 *
 * RTL-aware: in RTL, Yoga lays page 0 out on the RIGHT, but native
 * contentOffset.x / scrollTo({ x }) stay physical (from the left). So in RTL
 * page `i` sits at physical offset (count - 1 - i) * width. Tabs, indicator and
 * visible content all derive from one index through these two functions.
 */
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