import { sarh } from '@/constants/sarhTokens';

/**
 * Corner radii extracted from `sarh.radius`.
 * `full` (999) is the live pill token — not a new visual language.
 */
export const radius = {
  8: sarh.radius.sm,
  12: sarh.radius.md,
  16: sarh.radius.lg,
  20: sarh.radius.xl,
  999: sarh.radius.pill,
} as const;

export const radiusAlias = {
  sm: radius[8],
  md: radius[12],
  lg: radius[16],
  xl: radius[20],
  full: radius[999],
} as const;

export type RadiusToken = keyof typeof radius;
