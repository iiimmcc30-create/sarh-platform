import type { PlanAudience } from '@/services/subscriptionPlans';

/** Sarh Core paid listing/subscription plans only */
export function useSubscriptionAudience(): PlanAudience {
  return 'USER';
}
