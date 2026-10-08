import { Injectable } from '@nestjs/common';
import { PlanAudience, Prisma } from '@prisma/client';
import { normalizePlanSlug, buildPermissions } from '../../plans/plan.types';
import { PlanPermissionService } from '../../plans/plan-permission.service';
import { PlanResolverService } from '../../plans/plan-resolver.service';
import { PrismaService } from '../../prisma/prisma.service';
import { isVerificationPlanSlug } from '../verification/verification-tiers';
import { TRIAL_STATUS } from '../../lib/subscription-lifecycle';

export type TrialActivationResult =
  { ok: true } | { ok: false; reason: 'plan_unavailable' | 'not_eligible' };

const SUBSCRIPTION_SELECT = {
  id: true,
  userId: true,
  planId: true,
  planAudience: true,
  planDbId: true,
  billingCycle: true,
  status: true,
  renewDate: true,
  listingsUsed: true,
  liveMinutesUsed: true,
  featuredAdsUsed: true,
  pinnedAdsUsed: true,
  dailyAdsUsed: true,
  dailyAdsWindowStart: true,
  autoRenew: true,
  trialStartedAt: true,
  trialEndsAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class SubscriptionLifecycleRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planResolver: PlanResolverService,
    private readonly planPermissions: PlanPermissionService,
  ) {}

  findByUserId(userId: string) {
    return this.prisma.subscription.findUnique({
      where: { userId },
      select: SUBSCRIPTION_SELECT,
    });
  }

  findById(id: string) {
    return this.prisma.subscription.findUnique({
      where: { id },
      select: SUBSCRIPTION_SELECT,
    });
  }

  findExpirablePaidSubscriptions(now: Date) {
    return this.prisma.subscription.findMany({
      take: 500,
      where: {
        planId: { not: 'free' },
        renewDate: { lt: now },
      },
      select: SUBSCRIPTION_SELECT,
    });
  }

  findPaidSubscriptionsRenewingWithin(days: number, now: Date) {
    const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return this.prisma.subscription.findMany({
      take: 500,
      where: {
        planId: { not: 'free' },
        renewDate: { gt: now, lte: end },
        autoRenew: true,
      },
      select: SUBSCRIPTION_SELECT,
    });
  }

  /** Running free trials whose end falls within the next `hours` hours. */
  findTrialsEndingWithin(hours: number, now: Date) {
    const end = new Date(now.getTime() + hours * 60 * 60 * 1000);
    return this.prisma.subscription.findMany({
      take: 500,
      where: {
        planId: { not: 'free' },
        status: TRIAL_STATUS,
        renewDate: { gt: now, lte: end },
      },
      select: SUBSCRIPTION_SELECT,
    });
  }

  /** Subscription payments that went through (paid, or paid then refunded). */
  countPaidSubscriptionPayments(userId: string) {
    return this.prisma.payment.count({
      where: {
        userId,
        referenceType: 'subscription',
        status: { in: ['paid', 'refunded'] },
      },
    });
  }

  /**
   * Starts the free trial in ONE conditional write, so two concurrent taps
   * (or devices) can never both succeed: the row must still be on the free
   * plan, never have had a trial and never have been downgraded from a paid
   * plan. The account must also have no successful subscription payment.
   * The trial is stored like a paid period of the plan (same columns the
   * payment activation sets), with autoRenew = false (no grace, no renewal
   * reminders, never a charge) and status = "trial".
   */
  activateTrialTx(params: {
    userId: string;
    planSlug: string;
    audience: PlanAudience;
    startedAt: Date;
    endsAt: Date;
  }): Promise<TrialActivationResult> {
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.findFirst({
        where: {
          slug: normalizePlanSlug(params.planSlug),
          audience: params.audience,
          isActive: true,
          // Only a plan that is on sale (so the user can subscribe after).
          monthlyPrice: { gt: 0 },
        },
        select: { id: true },
      });
      if (!plan) return { ok: false, reason: 'plan_unavailable' };

      const paid = await tx.payment.count({
        where: {
          userId: params.userId,
          referenceType: 'subscription',
          status: { in: ['paid', 'refunded'] },
        },
      });
      if (paid > 0) return { ok: false, reason: 'not_eligible' };

      const updated = await tx.subscription.updateMany({
        where: {
          userId: params.userId,
          planId: 'free',
          trialStartedAt: null,
          NOT: { status: 'downgraded' },
        },
        data: {
          planId: normalizePlanSlug(params.planSlug),
          planAudience: params.audience,
          planDbId: plan.id,
          renewDate: params.endsAt,
          autoRenew: false,
          status: TRIAL_STATUS,
          trialStartedAt: params.startedAt,
          trialEndsAt: params.endsAt,
          listingsUsed: 0,
          liveMinutesUsed: 0,
          featuredAdsUsed: 0,
          pinnedAdsUsed: 0,
          dailyAdsUsed: 0,
          dailyAdsWindowStart: null,
        },
      });
      return updated.count === 1
        ? { ok: true }
        : { ok: false, reason: 'not_eligible' };
    });
  }

  countActiveFeaturedListings(userId: string) {
    return this.prisma.listing.count({
      where: { sellerId: userId, featured: true, status: 'active' },
    });
  }

  resetDailyAdsWindow(userId: string, windowStart: Date) {
    return this.prisma.subscription.update({
      where: { userId },
      data: { dailyAdsUsed: 0, dailyAdsWindowStart: windowStart },
    });
  }

  private async applyVerifiedBadgeSideEffect(
    tx: Prisma.TransactionClient,
    userId: string,
    planSlug: string,
    audience: PlanAudience,
    enabled: boolean,
  ) {
    const plan = this.planResolver.resolveSync(planSlug, audience);
    const shouldVerify =
      enabled &&
      !!plan &&
      this.planPermissions.hasVerifiedBadge(buildPermissions(plan.features));
    await tx.user
      .update({
        where: { id: userId },
        data: { verified: shouldVerify },
      })
      .catch(() => {});
  }

  downgradeToFreeTx(
    userId: string,
    previousPlanId: string,
    audience: PlanAudience,
  ): Promise<{ previousPlanId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const freePlan = await tx.plan.findUnique({
        where: { slug_audience: { slug: 'free', audience } },
      });

      await tx.subscription.update({
        where: { userId },
        data: {
          planId: 'free',
          planAudience: audience,
          ...(freePlan?.id ? { plan: { connect: { id: freePlan.id } } } : {}),
          status: 'downgraded',
          listingsUsed: 0,
          liveMinutesUsed: 0,
          featuredAdsUsed: 0,
          pinnedAdsUsed: 0,
          dailyAdsUsed: 0,
          dailyAdsWindowStart: null,
        },
      });

      // Verification plans manage the badge through VerificationBadgeService
      // (it keeps pre-existing badges); other plans keep the legacy behaviour.
      if (!isVerificationPlanSlug(previousPlanId)) {
        await this.applyVerifiedBadgeSideEffect(
          tx,
          userId,
          'free',
          audience,
          true,
        );
      }

      return { previousPlanId };
    });
  }

  activatePaidPlanTx(params: {
    subscriptionId: string;
    userId: string;
    targetPlanId: string;
    planAudience: PlanAudience;
    billingCycle: string;
    newRenewDate: Date;
    resetCounters: boolean;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const normalized = normalizePlanSlug(params.targetPlanId);
      const plan = await tx.plan.findFirst({
        where: { slug: normalized, audience: params.planAudience },
        include: { features: true },
      });

      const updateData: Prisma.SubscriptionUpdateInput = {
        planId: normalized,
        planAudience: params.planAudience,
        ...(plan?.id ? { plan: { connect: { id: plan.id } } } : {}),
        billingCycle: params.billingCycle,
        renewDate: params.newRenewDate,
        autoRenew: true,
        status: 'active',
      };
      if (params.resetCounters) {
        updateData.listingsUsed = 0;
        updateData.liveMinutesUsed = 0;
        updateData.featuredAdsUsed = 0;
        updateData.pinnedAdsUsed = 0;
        updateData.dailyAdsUsed = 0;
        updateData.dailyAdsWindowStart = null;
      }

      await tx.subscription.update({
        where: { id: params.subscriptionId },
        data: updateData,
      });

      if (plan) {
        const perms = buildPermissions(plan.features);

        if (this.planPermissions.hasVerifiedBadge(perms)) {
          await tx.user.update({
            where: { id: params.userId },
            data: { verified: true },
          });
        }
      }
    });
  }

  setAutoRenew(userId: string, autoRenew: boolean) {
    return this.prisma.subscription.update({
      where: { userId },
      data: { autoRenew },
      select: SUBSCRIPTION_SELECT,
    });
  }

  resetUsageCounters(userId: string) {
    return this.prisma.subscription.update({
      where: { userId },
      data: {
        listingsUsed: 0,
        liveMinutesUsed: 0,
        featuredAdsUsed: 0,
        pinnedAdsUsed: 0,
        dailyAdsUsed: 0,
      },
    });
  }

  resetMonthlyUsageCounters() {
    return this.prisma.subscription.updateMany({
      data: {
        liveMinutesUsed: 0,
        featuredAdsUsed: 0,
        pinnedAdsUsed: 0,
      },
    });
  }

  findUserEmail(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true, arabicName: true },
    });
  }
}
