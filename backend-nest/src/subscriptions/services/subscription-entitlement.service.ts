import { Injectable } from '@nestjs/common';
import type { PlanAudience } from '@prisma/client';
import { PlanPermissionService } from '../../plans/plan-permission.service';
import { PlanResolverService } from '../../plans/plan-resolver.service';
import { isUnlimited } from '../../plans/plan.types';
import {
  getEffectivePlanSlug,
  getSubscriptionStatus,
  hasPaidAccess,
} from '../../lib/subscription-lifecycle';
import { throwApi } from '../../common/exceptions/api.exception';
import {
  LISTING_DAILY_LIMIT_MESSAGE_AR,
  resolveListingCreateDailyLimit,
} from '../../listings/listing-policy';
import { SubscriptionLifecycleRepository } from '../repositories/subscription-lifecycle.repository';
import { SubscriptionsRepository } from '../repositories/subscriptions.repository';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class SubscriptionEntitlementService {
  constructor(
    private readonly repo: SubscriptionLifecycleRepository,
    private readonly subscriptionsRepo: SubscriptionsRepository,
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly permissions: PlanPermissionService,
    private readonly planResolver: PlanResolverService,
  ) {}

  async getAudienceForUser(userId: string): Promise<PlanAudience> {
    const role = await this.repo.findUserRole(userId);
    return role === 'BUTCHER' ? 'BUTCHER' : 'USER';
  }

  async getEffectiveContextForUser(userId: string) {
    const row = await this.repo.findByUserId(userId);
    if (!row) return null;

    await this.lifecycle.expireIfNeeded(row);
    const fresh = await this.repo.findByUserId(userId);
    if (!fresh) return null;

    const audience = fresh.planAudience;
    const effectiveSlug = getEffectivePlanSlug(fresh);
    return this.permissions.resolveEffective(
      effectiveSlug,
      audience,
      hasPaidAccess(fresh),
    );
  }

  async getEffectivePlanSlugForUser(userId: string): Promise<string> {
    const ctx = await this.getEffectiveContextForUser(userId);
    return ctx?.planSlug ?? 'free';
  }

  async getPermissionsForUser(userId: string) {
    const ctx = await this.getEffectiveContextForUser(userId);
    return ctx?.permissions ?? {};
  }

  private async resetDailyAdsIfNeeded(
    userId: string,
    row: NonNullable<
      Awaited<ReturnType<SubscriptionLifecycleRepository['findByUserId']>>
    >,
  ) {
    const now = new Date();
    const windowStart = row.dailyAdsWindowStart;
    if (!windowStart || now.getTime() - windowStart.getTime() >= MS_PER_DAY) {
      await this.repo.resetDailyAdsWindow(userId, now);
      return { ...row, dailyAdsUsed: 0, dailyAdsWindowStart: now };
    }
    return row;
  }

  async assertCanCreateListing(
    userId: string,
    params: { images: string[]; featured: boolean; pinned?: boolean },
    actor?: { role?: string },
  ): Promise<string> {
    let row = await this.repo.findByUserId(userId);
    if (!row) {
      await this.subscriptionsRepo.upsertFree(userId);
      row = await this.repo.findByUserId(userId);
    }
    if (!row) throwApi(404, 'ref_not_found', 'الاشتراك غير موجود');

    await this.lifecycle.expireIfNeeded(row);
    row = (await this.repo.findByUserId(userId))!;
    row = await this.resetDailyAdsIfNeeded(userId, row);

    const ctx = await this.permissions.resolveEffective(
      getEffectivePlanSlug(row),
      row.planAudience,
      hasPaidAccess(row),
    );
    const perms = ctx.permissions;

    const dailyLimit = resolveListingCreateDailyLimit(
      actor?.role,
      this.permissions.maxAdsPer24Hours(perms),
    );
    if (!dailyLimit.unlimited && row.dailyAdsUsed >= dailyLimit.limit) {
      throwApi(403, 'listing_limit', LISTING_DAILY_LIMIT_MESSAGE_AR);
    }

    if (params.featured) {
      const featuredLimit = this.permissions.monthlyFeaturedAds(perms);
      if (featuredLimit <= 0) {
        throwApi(403, 'plan_required', 'الإعلانات المميزة غير متاحة في باقتك');
      }
      if (row.featuredAdsUsed >= featuredLimit) {
        throw Object.assign(new Error(`featured_limit:${featuredLimit}`), {
          code: 'featured_limit',
          limit: featuredLimit,
        });
      }
    }

    if (params.pinned) {
      const pinnedLimit = this.permissions.monthlyPinnedAds(perms);
      if (pinnedLimit <= 0) {
        throwApi(403, 'plan_required', 'تثبيت الإعلانات غير متاح في باقتك');
      }
      if (row.pinnedAdsUsed >= pinnedLimit) {
        throw Object.assign(new Error(`pinned_limit:${pinnedLimit}`), {
          code: 'pinned_limit',
          limit: pinnedLimit,
        });
      }
    }

    return ctx.planSlug;
  }

  async assertCanApplyListingPromotion(
    userId: string,
    params: { featured?: boolean; pinned?: boolean },
  ): Promise<void> {
    if (!params.featured && !params.pinned) {
      throwApi(400, 'invalid_request', 'حدد نوع الترقية المطلوبة');
    }

    let row = await this.repo.findByUserId(userId);
    if (!row) {
      await this.subscriptionsRepo.upsertFree(userId);
      row = await this.repo.findByUserId(userId);
    }
    if (!row) throwApi(404, 'ref_not_found', 'الاشتراك غير موجود');

    await this.lifecycle.expireIfNeeded(row);
    row = (await this.repo.findByUserId(userId))!;

    const ctx = await this.permissions.resolveEffective(
      getEffectivePlanSlug(row),
      row.planAudience,
      hasPaidAccess(row),
    );
    const perms = ctx.permissions;

    if (params.featured) {
      const featuredLimit = this.permissions.monthlyFeaturedAds(perms);
      if (featuredLimit <= 0) {
        throwApi(403, 'plan_required', 'الإعلانات المميزة غير متاحة في باقتك');
      }
      if (row.featuredAdsUsed >= featuredLimit) {
        throw Object.assign(new Error(`featured_limit:${featuredLimit}`), {
          code: 'featured_limit',
          limit: featuredLimit,
        });
      }
    }

    if (params.pinned) {
      const pinnedLimit = this.permissions.monthlyPinnedAds(perms);
      if (pinnedLimit <= 0) {
        throwApi(403, 'plan_required', 'تثبيت الإعلانات غير متاح في باقتك');
      }
      if (row.pinnedAdsUsed >= pinnedLimit) {
        throw Object.assign(new Error(`pinned_limit:${pinnedLimit}`), {
          code: 'pinned_limit',
          limit: pinnedLimit,
        });
      }
    }
  }

  async assertCanCreateLiveStream(userId: string) {
    const row = await this.repo.findByUserId(userId);
    if (!row) {
      return {
        allowed: false as const,
        code: 'plan_required' as const,
        messageAr:
          'البث المباشر غير متاح في الباقة المجانية. قم بالترقية لبدء البث.',
        planId: 'free',
      };
    }

    await this.lifecycle.expireIfNeeded(row);
    const fresh = await this.repo.findByUserId(userId);
    if (!fresh) {
      return {
        allowed: false as const,
        code: 'plan_required' as const,
        messageAr:
          'البث المباشر غير متاح في الباقة المجانية. قم بالترقية لبدء البث.',
        planId: 'free',
      };
    }

    const ctx = await this.permissions.resolveEffective(
      getEffectivePlanSlug(fresh),
      fresh.planAudience,
      hasPaidAccess(fresh),
    );
    const perms = ctx.permissions;

    if (!this.permissions.canCreateLive(perms)) {
      return {
        allowed: false as const,
        code: 'plan_required' as const,
        messageAr: 'البث المباشر غير متاح في باقتك. قم بالترقية لبدء البث.',
        planId: ctx.planSlug,
      };
    }

    const liveMinutesLimit = this.permissions.monthlyLiveMinutes(perms);
    const liveMinutesUsed = fresh.liveMinutesUsed;

    if (
      !isUnlimited(this.permissions.monthlyLiveHours(perms)) &&
      liveMinutesUsed >= liveMinutesLimit
    ) {
      const hours = this.permissions.monthlyLiveHours(perms);
      return {
        allowed: false as const,
        code: 'live_minutes_limit' as const,
        messageAr: `لقد استنفدت حصة البث الشهرية (${hours} ساعة).`,
        planId: ctx.planSlug,
      };
    }

    return {
      allowed: true as const,
      planId: ctx.planSlug,
      liveMinutesLimit,
      liveMinutesUsed,
      permissions: perms,
    };
  }

  planPriorityBoost(planSlug: string, audience: PlanAudience): number {
    const plan = this.planResolver.resolveSync(planSlug, audience);
    if (!plan) return 0;
    return this.permissions.priorityBoost(plan.permissions);
  }

  async enrichSubscriptionView(
    row: NonNullable<
      Awaited<ReturnType<SubscriptionLifecycleRepository['findByUserId']>>
    >,
  ) {
    const status = getSubscriptionStatus(row);
    const effectivePlanSlug = getEffectivePlanSlug(row);
    const ctx = await this.permissions.resolveEffective(
      effectivePlanSlug,
      row.planAudience,
      hasPaidAccess(row),
    );

    return {
      id: row.id,
      planId: row.planId,
      planAudience: row.planAudience,
      billingCycle: row.billingCycle,
      renewDate: row.renewDate,
      status,
      effectivePlanId: effectivePlanSlug,
      effectivePlanSlug,
      autoRenew: row.autoRenew,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      usageCounters: {
        listingsUsed: row.listingsUsed,
        liveMinutesUsed: row.liveMinutesUsed,
        featuredAdsUsed: row.featuredAdsUsed,
        pinnedAdsUsed: row.pinnedAdsUsed,
        dailyAdsUsed: row.dailyAdsUsed,
      },
      permissions: ctx.permissions,
      plan: this.planResolver.toApiResponse(ctx.plan),
    };
  }
}
