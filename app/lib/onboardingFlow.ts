/**
 * Onboarding pager + flow logic. Pure helpers, no RN imports (unit-tested).
 *
 * One logical `index` (0 = first slide) drives the pager position, the dots,
 * the skip visibility and the CTA. Physical scroll offsets differ per platform
 * in RTL, so every offset <-> index conversion goes through `mode`:
 *
 * - `ltr`        page i at  i * width (from the left).
 * - `rtl-native` Yoga lays page 0 on the RIGHT; native offsets stay physical
 *                from the left -> page i at (count - 1 - i) * width
 *                (same math as the swipe-tab pager, lib/tabPager).
 * - `rtl-web`    a CSS `direction: rtl` scroller starts at scrollLeft 0 on the
 *                right and goes NEGATIVE to the left (react-native-web passes
 *                scrollLeft through untouched) -> page i at -i * width.
 */
import { clampTabIndex, tabPagerIndex, tabPagerOffset } from '@/lib/tabPager';

export type OnboardingPagerMode = 'ltr' | 'rtl-native' | 'rtl-web';

export function resolveOnboardingPagerMode(rtl: boolean, platformOS: string): OnboardingPagerMode {
  if (!rtl) return 'ltr';
  return platformOS === 'web' ? 'rtl-web' : 'rtl-native';
}

export function onboardingOffsetForIndex(
  index: number,
  width: number,
  count: number,
  mode: OnboardingPagerMode,
): number {
  if (count <= 0 || !(width > 0)) return 0;
  const safe = clampTabIndex(index, count);
  if (mode === 'rtl-web') return safe === 0 ? 0 : -safe * width;
  return tabPagerOffset(safe, width, count, mode === 'rtl-native');
}

export function onboardingIndexForOffset(
  offsetX: number,
  width: number,
  count: number,
  mode: OnboardingPagerMode,
): number {
  // rtl-web: |scrollLeft| already counts pages from the start (right) edge.
  if (mode === 'rtl-web') return tabPagerIndex(offsetX, width, count, false);
  return tabPagerIndex(offsetX, width, count, mode === 'rtl-native');
}

/**
 * Linear map physical offset -> logical progress (0 .. count - 1) for
 * Animated.interpolate (input range ascending, as RN requires).
 */
export function onboardingProgressRange(
  width: number,
  count: number,
  mode: OnboardingPagerMode,
): { inputRange: number[]; outputRange: number[] } {
  const w = width > 0 ? width : 1;
  const last = Math.max(0, count - 1);
  const span = last * w;
  if (mode === 'rtl-native') return { inputRange: [0, span], outputRange: [last, 0] };
  if (mode === 'rtl-web') return { inputRange: [-span, 0], outputRange: [last, 0] };
  return { inputRange: [0, span], outputRange: [0, last] };
}

/** Physical direction pages travel when moving forward: LTR -> left (-1), RTL -> right (+1). */
export function onboardingForwardSign(mode: OnboardingPagerMode): 1 | -1 {
  return mode === 'ltr' ? -1 : 1;
}

export function isLastOnboardingIndex(index: number, count: number): boolean {
  return count > 0 && clampTabIndex(index, count) === count - 1;
}

export type OnboardingNextAction = { type: 'goto'; index: number } | { type: 'finish' };

/** Primary CTA: next slide, or finish on the last slide. */
export function resolveOnboardingNext(index: number, count: number): OnboardingNextAction {
  if (count <= 0 || isLastOnboardingIndex(index, count)) return { type: 'finish' };
  return { type: 'goto', index: clampTabIndex(index, count) + 1 };
}

/** Android back: previous slide, or null to let the system handle it. */
export function previousOnboardingIndex(index: number, count: number): number | null {
  const safe = clampTabIndex(index, count);
  return safe > 0 ? safe - 1 : null;
}

export type OnboardingSlideMotion = {
  inputRange: [number, number, number];
  mediaTranslateX: [number, number, number];
  mediaScale: [number, number, number];
  mediaOpacity: [number, number, number];
  textTranslateX: [number, number, number];
  textOpacity: [number, number, number];
};

/** Parallax lag of the media / text relative to the page (fraction of width). */
export const ONBOARDING_MEDIA_PARALLAX = 0.12;
export const ONBOARDING_TEXT_PARALLAX = 0.28;

/**
 * Per-slide interpolation keyed on logical progress. Content lags the page
 * (parallax) in the direction of travel; reduced motion keeps only the fade.
 */
export function onboardingSlideMotion(
  slide: number,
  width: number,
  mode: OnboardingPagerMode,
  reduceMotion: boolean,
): OnboardingSlideMotion {
  const s = onboardingForwardSign(mode);
  const w = width > 0 ? width : 0;
  const media = reduceMotion ? 0 : s * w * ONBOARDING_MEDIA_PARALLAX;
  const text = reduceMotion ? 0 : s * w * ONBOARDING_TEXT_PARALLAX;
  const scale = reduceMotion ? 1 : 0.92;
  return {
    inputRange: [slide - 1, slide, slide + 1],
    mediaTranslateX: [media, 0, -media],
    mediaScale: [scale, 1, scale],
    mediaOpacity: [0.35, 1, 0.35],
    textTranslateX: [text, 0, -text],
    textOpacity: [0, 1, 0],
  };
}

/** Skip fades out while moving onto the last slide (no layout jump). */
export function onboardingSkipOpacityRange(count: number): {
  inputRange: number[];
  outputRange: number[];
} {
  if (count < 2) return { inputRange: [0, 1], outputRange: [0, 0] };
  return { inputRange: [count - 2, count - 1], outputRange: [1, 0] };
}

/**
 * Persist the completion flag without ever trapping the user: a storage
 * failure (quota / blocked web storage) still completes onboarding for this
 * session. Returns whether the flag was persisted.
 */
export async function persistOnboardingComplete(
  setItem: (key: string, value: string) => Promise<void>,
  key: string,
): Promise<boolean> {
  try {
    await setItem(key, 'true');
    return true;
  } catch {
    return false;
  }
}
