import type { PlanAudience } from '@/services/subscriptionPlans';

/** Sarh Core paid listing/subscription plans only — butcher catalogs are out of this app. */
export function useSubscriptionAudience(): PlanAudience {
  return 'USER';
}
