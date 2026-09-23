/**
 * Shared L2 layout scales.
 *
 * Everything here reuses the existing `@/design-system/tokens` grid — this is
 * naming, not a second spacing system.
 */
import type { ViewStyle } from 'react-native';
import { space, spaceAlias } from '@/design-system/tokens';

/** Vertical rhythm between screen sections. */
export const SECTION_GAP = space[24];

export const GAP = {
  none: 0,
  xs: spaceAlias.xs,
  sm: spaceAlias.sm,
  md: spaceAlias.md,
  lg: spaceAlias.lg,
  xl: spaceAlias.xl,
  xxl: spaceAlias.xxl,
  xxxl: spaceAlias.xxxl,
  /** Semantic alias — the distance between two `Section`s. */
  section: SECTION_GAP,
} as const;

export type GapToken = keyof typeof GAP;

export const ALIGN = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
} as const satisfies Record<string, NonNullable<ViewStyle['alignItems']>>;

export type AlignToken = keyof typeof ALIGN;

export const JUSTIFY = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
} as const satisfies Record<string, NonNullable<ViewStyle['justifyContent']>>;

export type JustifyToken = keyof typeof JUSTIFY;

/** Bar height excluding the safe-area inset. 48pt control + 16pt above/below. */
export const BOTTOM_ACTION_MIN_HEIGHT = space[48] + space[16] * 2;
