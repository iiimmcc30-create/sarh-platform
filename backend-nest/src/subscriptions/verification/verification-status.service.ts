import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPermissions } from '../../plans/plan.types';
import { PlanPermissionService } from '../../plans/plan-permission.service';
import { getSubscriptionStatus } from '../../lib/subscription-lifecycle';
import { SubscriptionsRepository } from '../repositories/subscriptions.repository';
import { VerificationBadgeService } from './verification-badge.service';
import { GoldDocumentGateService } from './gold-document-gate.service';
import {
  buildTrialInfo,
  SubscriptionTrialService,
} from '../services/subscription-trial.service';
import { SubscriptionEntitlementService } from '../services/subscription-entitlement.service';
import { SubscriptionBillingService } from '../billing/subscription-billing.service';
import { resolveBilling } from '../billing/subscription-billing';
import { BadgeVisibilityService } from '../visibility/badge-visibility.service';
import {
  FREE_WEEKLY_BOOST_TX_PREFIX,
  FREE_WEEKLY_BOOST_WINDOW_MS,
  canHostFollowersOnlyCouncils,
  canScheduleCouncils,
  canSeeProfileViewers,
  hasPrioritySupport,
  weeklyFreeBoostsFor,
} from '../perks/subscriber-perks';
import { resolveListingCreateDailyLimit } from '../../listings/listing-policy';
import {
  PROFILE_VIEWS_WINDOW_DAYS,
  listableViewerWhere,
} from '../../users/services/profile-views.service';
import {
  BADGE_COLOR_FOR_TIER,
  VERIFICATION_PLAN_SLUGS,
  VERIFICATION_TIERS,
  VERIFICATION_TIER_DEFAULTS,
  badgeColorForTier,
  effectiveApprovedTier,
  isReviewTier,
  TIER_REQUIRES_DOCUMENT,
  tierForPlanSlug,
  type VerificationTier,
} from './verification-tiers';

export type VerificationState =
  | 'not_started'
  | 'pending_review'
  | 'needs_amendments'
  | 'approved'
  | 'rejected';

export type VerificationSubscriptionState =
  'none' | 'active' | 'canceled' | 'grace_period' | 'expired';

export function mapVerificationState(
  request: { status?: string | null; approvedTier?: string | null } | null,
): VerificationState {
  if (!request) return 'not_started';
  if (request.status === 'UNDER_REVIEW') return 'pending_review';
  if (effectiveApprovedTier(request)) return 'approved';
  if (request.status === 'NEEDS_AMENDMENTS') return 'needs_amendments';
  if (request.status === 'REJECTED') return 'rejected';
  return 'not_started';
}

export function mapSubscriptionState(params: {
  subscription: { planId: string; renewDate: Date; autoRenew: boolean } | null;
  lastBadgePlanSlug: string | null;
  now?: Date;
}): { state: VerificationSubscriptionState; tier: VerificationTier | null } {
  const { subscription, lastBadgePlanSlug } = params;
  const now = params.now ?? new Date();
  if (!subscription) return { state: 'none', tier: null };
  const tier = tierForPlanSlug(subscription.planId);
  if (tier) {
    const status = getSubscriptionStatus(subscription, now);
    if (status === 'active') return { state: 'active', tier };
    if (status === 'cancelled') return { state: 'canceled', tier };
    if (status === 'grace_period') return { state: 'grace_period', tier };
    return { state: 'expired', tier };
  }
  const lastTier = tierForPlanSlug(lastBadgePlanSlug);
  if (lastTier) return { state: 'expired', tier: lastTier };
  return { state: 'none', tier: null };
}

@Injectable()
export class VerificationStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsRepo: SubscriptionsRepository,
    private readonly permissions: PlanPermissionService,
    private readonly badge: VerificationBadgeService,
    private readonly goldGate: GoldDocumentGateService,
    @Optional() private readonly trial?: SubscriptionTrialService,
    @Optional() private readonly entitlements?: SubscriptionEntitlementService,
    @Optional() private readonly billingService?: SubscriptionBillingService,
    @Optional() private readonly visibility?: BadgeVisibilityService,
  ) {}

  /**
   * Live perk usage for the «التوثيق» hub. Every value comes from the same
   * rules the API enforces (free boosts, daily listings, profile views,
   * support priority, councils); the tier is the EFFECTIVE plan.
   */
  async getPerks(userId: string, now = new Date()) {
    const ctx = await this.entitlements?.getEffectiveContextForUser(userId);
    const planSlug = ctx?.planSlug ?? 'free';
    const perms = ctx?.permissions ?? {};
    const tier = tierForPlanSlug(planSlug);

    const boostLimit = weeklyFreeBoostsFor(tier, perms.weeklyFreeBoosts);
    const windowStart = new Date(now.getTime() - FREE_WEEKLY_BOOST_WINDOW_MS);
    const [boosts, sub, viewers] = await Promise.all([
      boostLimit > 0
        ? this.prisma.listingBoost.findMany({
            where: {
              userId,
              amount: 0,
              transactionId: { startsWith: FREE_WEEKLY_BOOST_TX_PREFIX },
              createdAt: { gte: windowStart },
            },
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
            take: 50,
          })
        : Promise.resolve([] as Array<{ createdAt: Date }>),
      this.prisma.subscription.findUnique({
        where: { userId },
        select: { dailyAdsUsed: true, dailyAdsWindowStart: true },
      }),
      this.prisma.profileView.findMany({
        where: {
          profileId: userId,
          viewedAt: {
            gte: new Date(
              now.getTime() - PROFILE_VIEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
            ),
          },
          viewer: listableViewerWhere(userId),
        },
        distinct: ['viewerId'],
        select: { viewerId: true },
        take: 5000,
      }),
    ]);

    const oldest = boosts[0]?.createdAt;
    const daily = resolveListingCreateDailyLimit(
      undefined,
      this.permissions.maxAdsPer24Hours(perms),
      this.permissions.extraDailyListings(perms, planSlug),
    );
    const windowOpen =
      !!sub?.dailyAdsWindowStart &&
      now.getTime() - sub.dailyAdsWindowStart.getTime() < 24 * 60 * 60 * 1000;
    const dailyUsed = windowOpen ? (sub?.dailyAdsUsed ?? 0) : 0;

    return {
      tier,
      freeBoosts: {
        limit: boostLimit,
        used: Math.min(boosts.length, boostLimit),
        remaining: Math.max(0, boostLimit - boosts.length),
        nextResetAt: oldest
          ? new Date(oldest.getTime() + FREE_WEEKLY_BOOST_WINDOW_MS)
          : null,
      },
      dailyListings: {
        limit: daily.limit,
        used: Math.min(dailyUsed, daily.limit),
        resetsAt:
          windowOpen && sub?.dailyAdsWindowStart
            ? new Date(sub.dailyAdsWindowStart.getTime() + 24 * 60 * 60 * 1000)
            : null,
      },
      profileViews30d: {
        count: viewers.length,
        unlocked: canSeeProfileViewers(tier),
      },
      prioritySupport: hasPrioritySupport(tier),
      councils: {
        canSchedule: canScheduleCouncils(tier),
        canFollowersOnly: canHostFollowersOnlyCouncils(tier),
      },
    };
  }

  async getPlans() {
    const rows = await this.prisma.plan.findMany({
      where: {
        audience: 'USER',
        slug: { in: Object.values(VERIFICATION_PLAN_SLUGS) },
      },
      include: { features: true },
    });
    return VERIFICATION_TIERS.map((tier) => {
      const slug = VERIFICATION_PLAN_SLUGS[tier];
      const row = rows.find((r) => r.slug === slug);
      const perms = row ? buildPermissions(row.features) : {};
      const monthlyPrice = row?.monthlyPrice ?? 0;
      return {
        tier,
        slug,
        name: row?.name ?? null,
        monthlyPrice,
        currency: row?.currency ?? 'SAR',
        billingCycle: 'monthly' as const,
        /** Price set by an admin (> 0). 0 = placeholder, not purchasable. */
        priceConfigured: monthlyPrice > 0,
        /** Badge colour: Blue and Blue+ = blue, Gold = gold. */
        badgeColor: BADGE_COLOR_FOR_TIER[tier],
        /** Gold only: a merchant document is required before payment. */
        documentRequired: TIER_REQUIRES_DOCUMENT[tier],
        /** @deprecated same as documentRequired (kept for older app builds). */
        verificationRequired: TIER_REQUIRES_DOCUMENT[tier],
        available: !!row?.isActive && monthlyPrice > 0,
        extraDailyListings: this.permissions.extraDailyListings(perms, slug),
        /** Seller visibility priority (Blue 1 < Blue+ 2 < Gold 3). */
        visibilityBoost: this.permissions.priorityBoost(perms, slug),
        visibilityLevel: VERIFICATION_TIER_DEFAULTS[tier].visibilityLevel,
        /** Free 24h boosts every 7 days (Blue 0, Blue+ 2, Gold 4 by default). */
        weeklyFreeBoosts: weeklyFreeBoostsFor(tier, perms.weeklyFreeBoosts),
      };
    });
  }

  async getForUser(userId: string) {
    // An ended free trial goes back to the free plan on read (paid
    // subscriptions keep their expired / grace states as before).
    await this.trial?.expireIfEnded(userId);

    const subscriptionSelect = {
      id: true,
      planId: true,
      renewDate: true,
      autoRenew: true,
      status: true,
      trialStartedAt: true,
      trialEndsAt: true,
    } as const;
    let subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: subscriptionSelect,
    });
    if (!subscription) {
      await this.subscriptionsRepo.upsertFree(userId);
      subscription = await this.prisma.subscription.findUnique({
        where: { userId },
        select: subscriptionSelect,
      });
    }

    const badge = await this.badge.sync(userId);

    const [request, lastPayment, plans, goldDocument, paidCount] =
      await Promise.all([
        this.prisma.accountVerificationRequest.findUnique({
          where: { userId },
          select: {
            status: true,
            requestedTier: true,
            approvedTier: true,
            reviewReason: true,
            submittedAt: true,
            reviewedAt: true,
          },
        }),
        // Read-only lookup of the last paid subscription payment so an expired
        // badge subscription (already downgraded to free) is reported as expired.
        this.prisma.payment.findFirst({
          where: { userId, referenceType: 'subscription', status: 'paid' },
          orderBy: { createdAt: 'desc' },
          select: { metadata: true },
        }),
        this.getPlans(),
        this.goldGate.check(userId),
        this.prisma.payment.count({
          where: {
            userId,
            referenceType: 'subscription',
            status: { in: ['paid', 'refunded'] },
          },
        }),
      ]);

    const [store, perks, preferences] = await Promise.all([
      this.billingService?.findActiveStoreSubscription(userId) ?? null,
      this.entitlements ? this.getPerks(userId) : null,
      this.visibility?.getPrefs(userId) ?? null,
    ]);
    const billingInfo = resolveBilling({ subscription, store });

    const meta = (lastPayment?.metadata ?? {}) as Record<string, unknown>;
    const lastPlan =
      typeof meta.targetPlanId === 'string' ? meta.targetPlanId : null;
    const sub = mapSubscriptionState({
      subscription,
      lastBadgePlanSlug: lastPlan,
    });

    const approvedTier = effectiveApprovedTier(request);
    const trialInfo = buildTrialInfo(subscription, paidCount > 0);
    const trialPlan = plans.find((p) => p.slug === trialInfo.planSlug);

    return {
      plans,
      verification: {
        state: mapVerificationState(request),
        requestStatus: request?.status ?? null,
        requestedTier: isReviewTier(request?.requestedTier)
          ? request.requestedTier
          : null,
        approvedTier,
        reviewReason: request?.reviewReason ?? null,
        submittedAt: request?.submittedAt ?? null,
        reviewedAt: request?.reviewedAt ?? null,
      },
      /** Gold payment gate (same rule PaymentsService enforces). */
      goldDocument: goldDocument.ok
        ? { ready: true, code: null, messageAr: null }
        : {
            ready: false,
            code: goldDocument.code,
            messageAr: goldDocument.messageAr,
          },
      subscription: {
        id: subscription?.id ?? null,
        state: sub.state,
        tier: sub.tier,
        planId: subscription?.planId ?? 'free',
        renewDate: subscription?.renewDate ?? null,
        autoRenew: subscription?.autoRenew ?? false,
        /** True while the current period is the free trial (no payment). */
        isTrial: trialInfo.active,
      },
      /**
       * One-week free Blue+ trial (one per account, ever). Start it with
       * POST /subscriptions/trial. Eligible only while the Blue+ plan is on
       * sale (so the user can subscribe when the trial ends).
       */
      trial: {
        ...trialInfo,
        eligible: trialInfo.eligible && !!trialPlan?.available,
      },
      badge: {
        visible: badge?.verified ?? false,
        tier: badge?.verified ? (badge.verifiedTier ?? 'blue') : null,
        color: badge?.verified ? badgeColorForTier(badge.verifiedTier) : null,
        /** Badge that pre-dates tiered verification (kept, shown blue). */
        legacy: !!badge?.verified && !badge.verifiedTier,
      },
      billing: {
        cycle: 'monthly' as const,
        /**
         * Payment Core has no saved-card / merchant-initiated charges today, so
         * renewal is a reminded re-payment through the same checkout (no
         * automatic card charge). See VERIFICATION report.
         */
        automaticCharge: false,
        renewal: 'reminder_and_checkout' as const,
        /**
         * Where the current period is billed: app_store / google_play (manage
         * and cancel in the store), ngenius (website, manual renewal), trial
         * or none. `autoRenew` / `expiresAt` follow the store when store-billed.
         */
        source: billingInfo.source,
        autoRenew: billingInfo.autoRenew,
        expiresAt: billingInfo.expiresAt,
      },
      /** Live perk usage (null when the entitlement service is unavailable). */
      perks,
      /** Badge visibility preferences (PATCH /verification/preferences). */
      preferences: preferences ?? {
        hideVerifiedBadge: false,
        hideGoldSellerLabel: false,
      },
    };
  }
}
