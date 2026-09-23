/** @deprecated Hardcoded plans removed — use GET /plans API */
export type BillingCycle = 'monthly' | 'yearly';

export type { PlanPermissions, ResolvedPlan } from '../plans/plan.types';
export {
  normalizePlanSlug,
  LEGACY_PLAN_SLUG_MAP,
  FREE_PLAN_SLUG,
} from '../plans/plan.types';
