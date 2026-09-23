import { clampPromoteDurationHours } from './promotion-limits.config';

export type ReachEstimate = { min: number; max: number };

export type ReachFactors = {
  budgetFactorMin: number;
  budgetFactorMax: number;
  hourFactorMin: number;
  hourFactorMax: number;
};

export const DEFAULT_REACH_FACTORS: ReachFactors = {
  budgetFactorMin: 9,
  budgetFactorMax: 15,
  hourFactorMin: 3,
  hourFactorMax: 5,
};

/**
 * Estimated impression range for visibility promotion.
 * min = amount × budgetFactorMin + hours × hourFactorMin
 * max = amount × budgetFactorMax + hours × hourFactorMax
 * Admin-configurable via AppSettings keys pricing.reach.*
 */
export function estimatePromotionReach(
  amount: number,
  rawDurationHours: number,
  factors: ReachFactors = DEFAULT_REACH_FACTORS,
): ReachEstimate {
  const durationHours = clampPromoteDurationHours(rawDurationHours);
  const min = Math.max(
    50,
    Math.round(
      amount * factors.budgetFactorMin + durationHours * factors.hourFactorMin,
    ),
  );
  const max = Math.max(
    min + 30,
    Math.round(
      amount * factors.budgetFactorMax + durationHours * factors.hourFactorMax,
    ),
  );
  return { min, max };
}
