import { I18nManager } from 'react-native';

/**
 * Horizontal paging math for RN ScrollView in RTL.
 *
 * In RTL, Yoga lays the row out right-to-left (item 0 is the right-most page),
 * but native `contentOffset.x` / `scrollTo({ x })` / `onScroll` offsets stay
 * physical (measured from the left edge). On Android, ReactHorizontalScrollView
 * also keeps a constant distance to the right edge when content lays out, so the
 * first visible page is item 0. Mapping index <-> offset as `index * width`
 * therefore shows item `count - 1 - index` while the code believes `index` is
 * visible.
 */
export function isHorizontalPagerRtl(): boolean {
  return Boolean(I18nManager?.isRTL);
}

export function pagerOffsetForIndex(
  index: number,
  count: number,
  width: number,
  rtl: boolean,
): number {
  if (count <= 0 || !(width > 0)) return 0;
  const safe = Math.min(Math.max(0, Math.floor(index)), count - 1);
  return (rtl ? count - 1 - safe : safe) * width;
}

export function pagerIndexForOffset(
  offsetX: number,
  count: number,
  width: number,
  rtl: boolean,
): number {
  if (count <= 0 || !(width > 0) || !Number.isFinite(offsetX)) return 0;
  const physical = Math.min(Math.max(0, Math.round(offsetX / width)), count - 1);
  return rtl ? count - 1 - physical : physical;
}

/** Seek-bar touch → 0..1 progress. The fill grows from the inline start (right in RTL). */
export function seekRatioFromTouch(locationX: number, width: number, rtl: boolean): number {
  if (!(width > 0) || !Number.isFinite(locationX)) return 0;
  const ltr = Math.min(1, Math.max(0, locationX / width));
  return rtl ? 1 - ltr : ltr;
}
