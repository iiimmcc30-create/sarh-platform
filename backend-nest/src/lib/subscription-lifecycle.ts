// Subscription lifecycle helpers — status + gating (plan features resolved via DB services)
import { normalizePlanSlug, FREE_PLAN_SLUG } from '../plans/plan.types';

export const SUBSCRIPTION_GRACE_DAYS = parseInt(
  process.env.SUBSCRIPTION_GRACE_DAYS || '3',
  10,
);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type SubscriptionStatus =
  'active' | 'expired' | 'cancelled' | 'grace_period' | 'downgraded';

export type SubscriptionRow = {
  planId: string;
  renewDate: Date;
  autoRenew: boolean;
};

export function isPaidPlan(planId: string): boolean {
  return normalizePlanSlug(planId) !== FREE_PLAN_SLUG;
}

export function isUpgrade(
  fromPlanId: string,
  toPlanId: string,
  tierOf: (slug: string) => number,
): boolean {
  return (
    tierOf(normalizePlanSlug(toPlanId)) > tierOf(normalizePlanSlug(fromPlanId))
  );
}

/** Paid access window: active until renewDate (+ grace if autoRenew). */
export function hasPaidAccess(
  sub: SubscriptionRow,
  now: Date = new Date(),
): boolean {
  if (!isPaidPlan(sub.planId)) return false;
  if (sub.renewDate > now) return true;
  if (!sub.autoRenew) return false;
  const graceEnd = new Date(
    sub.renewDate.getTime() + SUBSCRIPTION_GRACE_DAYS * MS_PER_DAY,
  );
  return now <= graceEnd;
}

export function getSubscriptionStatus(
  sub: SubscriptionRow,
  now: Date = new Date(),
): SubscriptionStatus {
  if (!isPaidPlan(sub.planId)) {
    return 'active';
  }

  if (sub.renewDate > now) {
    return sub.autoRenew ? 'active' : 'cancelled';
  }

  if (sub.autoRenew) {
    const graceEnd = new Date(
      sub.renewDate.getTime() + SUBSCRIPTION_GRACE_DAYS * MS_PER_DAY,
    );
    if (now <= graceEnd) return 'grace_period';
  }

  return 'expired';
}

/** Plan slug used for limits / features (free when expired). */
export function getEffectivePlanSlug(
  sub: SubscriptionRow,
  now: Date = new Date(),
): string {
  if (hasPaidAccess(sub, now)) {
    return normalizePlanSlug(sub.planId);
  }
  if (!isPaidPlan(sub.planId)) {
    return FREE_PLAN_SLUG;
  }
  const status = getSubscriptionStatus(sub, now);
  if (status === 'grace_period') {
    return normalizePlanSlug(sub.planId);
  }
  return FREE_PLAN_SLUG;
}

/**
 * Block subscription payment only for early renewal of the same paid plan.
 * Free users may always upgrade; paid users may upgrade tier anytime.
 */
export function shouldBlockSubscriptionPayment(
  sub: SubscriptionRow,
  targetPlanId: string,
  tierOf: (slug: string) => number,
  now: Date = new Date(),
): boolean {
  if (!isPaidPlan(sub.planId)) return false;
  if (isUpgrade(sub.planId, targetPlanId, tierOf)) return false;
  if (sub.renewDate > now) return true;
  return false;
}

export function msUntilRenewDate(
  renewDate: Date,
  now: Date = new Date(),
): number {
  return renewDate.getTime() - now.getTime();
}

export function daysUntilRenewDate(
  renewDate: Date,
  now: Date = new Date(),
): number {
  return Math.ceil(msUntilRenewDate(renewDate, now) / MS_PER_DAY);
}

/** @deprecated Use PlanResolverService.planTier — kept for gradual migration */
export function planTier(planId: string): number {
  const slug = normalizePlanSlug(planId);
  const tiers: Record<string, number> = {
    free: 0,
    'sarh-pro': 1,
    growth: 1,
    starter: 1,
    pro: 2,
    vip: 3,
  };
  return tiers[slug] ?? 0;
}
