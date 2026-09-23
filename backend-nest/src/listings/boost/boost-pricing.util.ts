import { lookupPromotePrice, type PromotePricedGoal } from '../promote-catalog';

export type BoostPlanType = 'pinned' | 'featured' | 'both';

/** @deprecated Catalog amounts are fixed; this is no longer a charge formula. */
export const BOOST_RATE_PER_12H = {
  pinned: 0,
  featured: 0,
  both: 0,
} as const;

/** Lowest official catalog amount (featured 1 day). */
export const BOOST_AMOUNT_MIN = 9;

/**
 * Resolve a catalog amount for a boost type + duration.
 * Unknown durations return 0 — callers must reject that.
 */
export function boostPriceForHours(
  boostType: BoostPlanType,
  rawHours: number,
  _overrideRate?: number,
): number {
  const hours = Math.max(1, Math.round(rawHours));
  return (
    lookupPromotePrice(boostType as PromotePricedGoal, { durationHours: hours })
      ?.amount ?? 0
  );
}

/** Resolve visibility catalog amount. Unknown durations return 0. */
export function promotionPriceForHours(
  rawHours: number,
  _basePer24h?: number,
): number {
  const hours = Math.max(1, Math.round(rawHours));
  return (
    lookupPromotePrice('visibility', { durationHours: hours })?.amount ?? 0
  );
}

/** @deprecated Visibility uses the official catalog, not a 24h base rate. */
export const PROMOTION_DEFAULT_BASE_PER_24H = 19;
