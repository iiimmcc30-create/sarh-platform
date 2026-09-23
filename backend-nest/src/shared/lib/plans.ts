/** @deprecated Hardcoded plans removed — use PlanResolverService / GET /plans */
export type BillingCycle = 'monthly' | 'yearly';
export {
  normalizePlanSlug,
  LEGACY_PLAN_SLUG_MAP,
  FREE_PLAN_SLUG,
} from '../../plans/plan.types';
