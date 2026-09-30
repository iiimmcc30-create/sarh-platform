import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPermissions } from '../../plans/plan.types';
import { PlanPermissionService } from '../../plans/plan-permission.service';
import { getSubscriptionStatus } from '../../lib/subscription-lifecycle';
import { SubscriptionsRepository } from '../repositories/subscriptions.repository';
import { VerificationBadgeService } from './verification-badge.service';
import {
  VERIFICATION_PLAN_SLUGS,
  VERIFICATION_TIERS,
  effectiveApprovedTier,
  isVerificationTier,
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
  ) {}

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
        available: !!row?.isActive && monthlyPrice > 0,
        extraDailyListings: this.permissions.extraDailyListings(perms, slug),
        visibilityBoost: this.permissions.priorityBoost(perms),
      };
    });
  }

  async getForUser(userId: string) {
    let subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { id: true, planId: true, renewDate: true, autoRenew: true },
    });
    if (!subscription) {
      await this.subscriptionsRepo.upsertFree(userId);
      subscription = await this.prisma.subscription.findUnique({
        where: { userId },
        select: { id: true, planId: true, renewDate: true, autoRenew: true },
      });
    }

    const badge = await this.badge.sync(userId);

    const [request, lastPayment, plans] = await Promise.all([
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
    ]);

    const meta = (lastPayment?.metadata ?? {}) as Record<string, unknown>;
    const lastPlan =
      typeof meta.targetPlanId === 'string' ? meta.targetPlanId : null;
    const sub = mapSubscriptionState({
      subscription,
      lastBadgePlanSlug: lastPlan,
    });

    const approvedTier = effectiveApprovedTier(request);

    return {
      plans,
      verification: {
        state: mapVerificationState(request),
        requestStatus: request?.status ?? null,
        requestedTier: isVerificationTier(request?.requestedTier)
          ? request.requestedTier
          : null,
        approvedTier,
        reviewReason: request?.reviewReason ?? null,
        submittedAt: request?.submittedAt ?? null,
        reviewedAt: request?.reviewedAt ?? null,
      },
      subscription: {
        id: subscription?.id ?? null,
        state: sub.state,
        tier: sub.tier,
        planId: subscription?.planId ?? 'free',
        renewDate: subscription?.renewDate ?? null,
        autoRenew: subscription?.autoRenew ?? false,
      },
      badge: {
        visible: badge?.verified ?? false,
        tier: badge?.verified ? (badge.verifiedTier ?? 'blue') : null,
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
      },
    };
  }
}
