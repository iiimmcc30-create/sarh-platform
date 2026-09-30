import { Injectable } from '@nestjs/common';
import type { PlanAudience } from '@prisma/client';
import { PlanResolverService } from './plan-resolver.service';
import {
  extraDailyListingsForPlan,
  visibilityLevelForPlan,
} from '../subscriptions/verification/verification-tiers';
import {
  isUnlimited,
  permissionBoolean,
  permissionNumber,
  type PlanPermissions,
  type ResolvedPlan,
} from './plan.types';

export type EffectiveSubscriptionContext = {
  planSlug: string;
  planAudience: PlanAudience;
  plan: ResolvedPlan;
  permissions: PlanPermissions;
};

@Injectable()
export class PlanPermissionService {
  constructor(private readonly resolver: PlanResolverService) {}

  async resolveForUser(
    planSlug: string,
    planAudience: PlanAudience,
  ): Promise<EffectiveSubscriptionContext | null> {
    const plan = await this.resolver.resolve(planSlug, planAudience);
    if (!plan) return null;
    return {
      planSlug: plan.slug,
      planAudience: plan.audience,
      plan,
      permissions: plan.permissions,
    };
  }

  async resolveEffective(
    planSlug: string,
    planAudience: PlanAudience,
    hasPaidAccess: boolean,
  ): Promise<EffectiveSubscriptionContext> {
    const slug = hasPaidAccess ? planSlug : 'free';
    const ctx = await this.resolveForUser(slug, planAudience);
    if (ctx) return ctx;
    const fallback = await this.resolver.resolveDefaultFree(planAudience);
    return {
      planSlug: fallback.slug,
      planAudience: fallback.audience,
      plan: fallback,
      permissions: fallback.permissions,
    };
  }

  canCreateLive(permissions: PlanPermissions): boolean {
    return permissionBoolean(permissions, 'canCreateLive');
  }

  maxAdsPer24Hours(permissions: PlanPermissions): number {
    return permissionNumber(permissions, 'maxAdsPer24Hours', 1);
  }

  monthlyFeaturedAds(permissions: PlanPermissions): number {
    return permissionNumber(permissions, 'monthlyFeaturedAds', 0);
  }

  monthlyPinnedAds(permissions: PlanPermissions): number {
    return permissionNumber(permissions, 'monthlyPinnedAds', 0);
  }

  monthlyLiveHours(permissions: PlanPermissions): number {
    return permissionNumber(permissions, 'monthlyLiveHours', 0);
  }

  monthlyLiveMinutes(permissions: PlanPermissions): number {
    const hours = this.monthlyLiveHours(permissions);
    if (isUnlimited(hours)) return Number.MAX_SAFE_INTEGER;
    return hours * 60;
  }

  hasPrioritySearch(permissions: PlanPermissions): boolean {
    return permissionBoolean(permissions, 'prioritySearch');
  }

  hasPriorityHome(permissions: PlanPermissions): boolean {
    return permissionBoolean(permissions, 'priorityHome');
  }

  hasVerifiedBadge(permissions: PlanPermissions): boolean {
    return permissionBoolean(permissions, 'verifiedBadge');
  }

  /** Extra daily listings on top of the base allowance (verification plans). */
  extraDailyListings(permissions: PlanPermissions, planSlug: string): number {
    return extraDailyListingsForPlan(planSlug, permissions.extraDailyListings);
  }

  /**
   * Seller visibility priority used to rank listings. Verification plans use
   * their tier level (Blue 1 < Blue+ 2 < Gold 3) while prioritySearch is on;
   * other plans keep the feature-based levels.
   */
  priorityBoost(permissions: PlanPermissions, planSlug?: string): number {
    const tierLevel = visibilityLevelForPlan(planSlug);
    if (tierLevel != null) {
      return this.hasPrioritySearch(permissions) ? tierLevel : 0;
    }
    if (!this.hasPrioritySearch(permissions)) return 0;
    if (this.hasPriorityHome(permissions)) return 3;
    if (this.hasVerifiedBadge(permissions)) return 2;
    return 1;
  }
}
