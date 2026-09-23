/**
 * 4pt spacing grid. Extends the live `sarh.space` set (which stops at 32)
 * with 40 / 48 / 64 for future layout — unused by screens in this phase.
 */
export const space = {
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  20: 20,
  24: 24,
  32: 32,
  40: 40,
  48: 48,
  64: 64,
} as const;

export const spaceAlias = {
  xs: space[4],
  sm: space[8],
  md: space[12],
  lg: space[16],
  xl: space[20],
  xxl: space[24],
  xxxl: space[32],
} as const;

export type SpaceToken = keyof typeof space;
