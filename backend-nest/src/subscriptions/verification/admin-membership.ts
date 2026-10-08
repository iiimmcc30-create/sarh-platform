import {
  getSubscriptionStatus,
  isPaidPlan,
  isTrialRow,
  type SubscriptionRow,
} from '../../lib/subscription-lifecycle';
import {
  badgeColorForTier,
  effectiveApprovedTier,
  isReviewTier,
  isVerificationTier,
  type BadgeColor,
  type ReviewTier,
  type VerificationTier,
} from './verification-tiers';
import {
  mapSubscriptionState,
  mapVerificationState,
  type VerificationState,
  type VerificationSubscriptionState,
} from './verification-status.service';

/** Relations the admin user queries load to build the membership summary. */
export const ADMIN_MEMBERSHIP_SELECT = {
  subscriptionBadge: true,
  subscription: {
    select: {
      planId: true,
      status: true,
      renewDate: true,
      autoRenew: true,
      trialStartedAt: true,
      trialEndsAt: true,
      createdAt: true,
      plan: { select: { name: true, monthlyPrice: true, currency: true } },
    },
  },
  accountVerificationRequest: {
    select: {
      status: true,
      requestedTier: true,
      approvedTier: true,
      submittedAt: true,
      reviewedAt: true,
    },
  },
} as const;

type MembershipSource = {
  verified: boolean;
  verifiedTier?: string | null;
  subscriptionBadge?: boolean | null;
  subscription?:
    | (SubscriptionRow & {
        status?: string | null;
        createdAt?: Date | null;
        trialStartedAt?: Date | null;
        trialEndsAt?: Date | null;
        plan?: {
          name: string;
          monthlyPrice: number;
          currency: string;
        } | null;
      })
    | null;
  accountVerificationRequest?: {
    status?: string | null;
    requestedTier?: string | null;
    approvedTier?: string | null;
    submittedAt?: Date | null;
    reviewedAt?: Date | null;
  } | null;
};

export type LastPaidSubscription = {
  paidAt: Date | null;
  createdAt: Date;
  metadata: unknown;
} | null;

export type AdminMembership = {
  badge: {
    visible: boolean;
    /** blue | blue_plus | gold; legacy verified users without a tier show blue. */
    tier: VerificationTier | null;
    /** Badge colour: blue (Blue, Blue+, legacy) or gold (approved Gold). */
    color: BadgeColor | null;
    legacy: boolean;
  };
  verification: {
    state: VerificationState;
    requestStatus: string | null;
    requestedTier: ReviewTier | null;
    approvedTier: ReviewTier | null;
    submittedAt: Date | null;
    reviewedAt: Date | null;
  };
  subscription: {
    planId: string;
    planName: string | null;
    monthlyPrice: number | null;
    currency: string | null;
    /** Verification-plan state (none/active/canceled/grace_period/expired). */
    state: VerificationSubscriptionState;
    /** Generic lifecycle status for any paid plan (free plans: 'free'). */
    lifecycle: string;
    tier: VerificationTier | null;
    /** Start of the current paid period (last paid subscription payment). */
    startedAt: Date | null;
    /** End of the paid period (renewal / expiry date). */
    renewDate: Date | null;
    /** Renewal intent flag (manual renewal; never an automatic charge). */
    renewalIntent: boolean;
    /** Where the current period comes from: free trial, payment, or none. */
    source: 'trial' | 'paid' | null;
    /** When the account used its one free trial (null = never). */
    trialStartedAt: Date | null;
    trialEndsAt: Date | null;
  };
};

/** Pure mapper used by the admin users list / detail endpoints. */
export function buildAdminMembership(
  user: MembershipSource,
  lastPaid: LastPaidSubscription,
  now: Date = new Date(),
): AdminMembership {
  const sub = user.subscription ?? null;
  const request = user.accountVerificationRequest ?? null;
  const meta = (lastPaid?.metadata ?? {}) as Record<string, unknown>;
  const lastPlan =
    typeof meta.targetPlanId === 'string' ? meta.targetPlanId : null;
  const mapped = mapSubscriptionState({
    subscription: sub,
    lastBadgePlanSlug: lastPlan,
    now,
  });
  const paid = !!sub && isPaidPlan(sub.planId);
  const badgeTier = user.verified
    ? isVerificationTier(user.verifiedTier)
      ? user.verifiedTier
      : 'blue'
    : null;
  return {
    badge: {
      visible: !!user.verified,
      tier: badgeTier,
      color: user.verified ? badgeColorForTier(user.verifiedTier) : null,
      legacy: !!user.verified && !user.subscriptionBadge && !user.verifiedTier,
    },
    verification: {
      state: mapVerificationState(request),
      requestStatus: request?.status ?? null,
      requestedTier: isReviewTier(request?.requestedTier)
        ? request.requestedTier
        : null,
      approvedTier: effectiveApprovedTier(request),
      submittedAt: request?.submittedAt ?? null,
      reviewedAt: request?.reviewedAt ?? null,
    },
    subscription: {
      planId: sub?.planId ?? 'free',
      planName: sub?.plan?.name ?? null,
      monthlyPrice: sub?.plan?.monthlyPrice ?? null,
      currency: sub?.plan?.currency ?? null,
      state: mapped.state,
      lifecycle: sub && paid ? getSubscriptionStatus(sub, now) : 'free',
      tier: mapped.tier,
      startedAt:
        paid || mapped.state === 'expired'
          ? (lastPaid?.paidAt ?? lastPaid?.createdAt ?? null)
          : null,
      renewDate:
        paid || mapped.state === 'expired' ? (sub?.renewDate ?? null) : null,
      renewalIntent: paid ? !!sub?.autoRenew : false,
      source: sub && paid ? (isTrialRow(sub) ? 'trial' : 'paid') : null,
      trialStartedAt: sub?.trialStartedAt ?? null,
      trialEndsAt: sub?.trialEndsAt ?? null,
    },
  };
}
