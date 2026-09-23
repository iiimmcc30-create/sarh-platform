import { boostPlansFromCatalog } from '../promote-catalog';

/**
 * Boost plan chips. Amounts come from the official promote catalog.
 * `both` is featured + pinned for the same duration (API compatibility).
 */
export const BOOST_PLANS = boostPlansFromCatalog();

export type BoostPlanType = keyof typeof BOOST_PLANS;
