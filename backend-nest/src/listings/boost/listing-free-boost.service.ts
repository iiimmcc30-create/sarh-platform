import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { throwApi } from '../../common/exceptions/api.exception';
import { LoggerService } from '../../common/services/logger.service';
import { AppNotificationsService } from '../../queue/services/app-notifications.service';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { PaidServicesService } from '../../settings/paid-services.service';
import { SubscriptionEntitlementService } from '../../subscriptions/services/subscription-entitlement.service';
import { tierForPlanSlug } from '../../subscriptions/verification/verification-tiers';
import { weeklyFreeBoostsFor } from '../../subscriptions/perks/subscriber-perks';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { LISTINGS_FEED_CACHE_PATTERN } from '../listings-cache-keys';
import { HOUR_MS, extendBoostUntil } from './extend-until';

/** A free boost is the catalog's 24h «مميز» (featured), applied without payment. */
export const FREE_BOOST_TYPE = 'featured' as const;
export const FREE_BOOST_HOURS = 24;
/** Rolling window for the weekly allowance. */
export const FREE_BOOST_WINDOW_MS = 7 * 24 * HOUR_MS;
/** Marks free boosts on the regular ListingBoost row (no Payment row). */
export const FREE_BOOST_TX_PREFIX = 'FREE-WEEKLY-';

export type FreeBoostQuota = {
  eligible: boolean;
  tier: string | null;
  weeklyLimit: number;
  used: number;
  remaining: number;
  /** When the oldest boost of the window frees a slot (null when none used). */
  nextResetAt: string | null;
  boostType: typeof FREE_BOOST_TYPE;
  durationHours: number;
};

/**
 * Weekly free boosts (Blue+ 2 / Gold 4, plan feature `weeklyFreeBoosts`).
 * Reuses the existing boost mechanism: a ListingBoost row (amount 0, status
 * paid) and the same Until math as a paid boost. The paid flow, N-Genius and
 * webhooks are untouched. Quota is enforced here under a per-user row lock.
 */
@Injectable()
export class ListingFreeBoostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: SubscriptionEntitlementService,
    private readonly paidServices: PaidServicesService,
    private readonly notifications: AppNotificationsService,
    private readonly cache: RedisCacheService,
    private readonly logger: LoggerService,
  ) {}

  private async weeklyLimit(userId: string) {
    const ctx = await this.entitlements.getEffectiveContextForUser(userId);
    const tier = tierForPlanSlug(ctx?.planSlug ?? 'free');
    return {
      tier,
      limit: weeklyFreeBoostsFor(tier, ctx?.permissions?.weeklyFreeBoosts),
    };
  }

  private windowWhere(userId: string, now: Date) {
    return {
      userId,
      amount: 0,
      transactionId: { startsWith: FREE_BOOST_TX_PREFIX },
      createdAt: { gte: new Date(now.getTime() - FREE_BOOST_WINDOW_MS) },
    };
  }

  async getQuota(user: JwtPayload, now = new Date()): Promise<FreeBoostQuota> {
    const { tier, limit } = await this.weeklyLimit(user.userId);
    const recent =
      limit > 0
        ? await this.prisma.listingBoost.findMany({
            where: this.windowWhere(user.userId, now),
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
            take: 50,
          })
        : [];
    const used = recent.length;
    const remaining = Math.max(0, limit - used);
    const oldest = recent[0]?.createdAt;
    return {
      eligible: limit > 0,
      tier,
      weeklyLimit: limit,
      used,
      remaining,
      nextResetAt: oldest
        ? new Date(oldest.getTime() + FREE_BOOST_WINDOW_MS).toISOString()
        : null,
      boostType: FREE_BOOST_TYPE,
      durationHours: FREE_BOOST_HOURS,
    };
  }

  async applyFreeBoost(user: JwtPayload, listingId: string, now = new Date()) {
    await this.paidServices.assertBoostTypeEnabled(FREE_BOOST_TYPE);
    const { limit } = await this.weeklyLimit(user.userId);
    if (limit <= 0) {
      throwApi(
        403,
        'plan_required',
        'التمييز المجاني متاح لمشتركي Blue+ وGold',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Serialize free boosts per user so two taps can never exceed the quota.
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE id = ${user.userId} FOR UPDATE`;
      const listing = await tx.listing.findFirst({
        where: {
          id: listingId,
          sellerId: user.userId,
          deletedAt: null,
          status: 'active',
        },
        select: {
          id: true,
          arabicTitle: true,
          featuredUntil: true,
          pinnedUntil: true,
        },
      });
      if (!listing) throwApi(404, 'listing_not_found', 'الإعلان غير موجود');

      const used = await tx.listingBoost.count({
        where: this.windowWhere(user.userId, now),
      });
      if (used >= limit) {
        throwApi(
          409,
          'free_boost_quota',
          'استخدمت التمييز المجاني لهذا الأسبوع',
          { weeklyLimit: limit },
        );
      }

      const { expiresAt, listingData } = extendBoostUntil(
        FREE_BOOST_TYPE,
        listing,
        now,
        FREE_BOOST_HOURS * HOUR_MS,
      );
      const boost = await tx.listingBoost.create({
        data: {
          listingId,
          userId: user.userId,
          boostType: FREE_BOOST_TYPE,
          durationDays: 1,
          amount: 0,
          currency: 'SAR',
          status: 'paid',
          paidAt: now,
          startsAt: now,
          expiresAt,
        },
        select: { id: true },
      });
      await tx.listingBoost.update({
        where: { id: boost.id },
        data: { transactionId: `${FREE_BOOST_TX_PREFIX}${boost.id}` },
      });
      await tx.listing.update({ where: { id: listingId }, data: listingData });
      return {
        boostId: boost.id,
        expiresAt,
        title: listing.arabicTitle,
        remaining: Math.max(0, limit - used - 1),
      };
    });

    await this.cache.delPattern(LISTINGS_FEED_CACHE_PATTERN).catch(() => {});
    await this.cache.del(`listing:${listingId}`).catch(() => {});
    void this.notifications
      .notifyUser({
        userId: user.userId,
        type: 'system',
        titleAr: '⭐ تم تمييز إعلانك مجاناً',
        bodyAr: `إعلانك "${result.title}" مميز حتى ${result.expiresAt.toLocaleDateString('ar-SA')}.`,
        data: {
          boostId: result.boostId,
          listingId,
          boostType: FREE_BOOST_TYPE,
        },
      })
      .catch(() => {});
    this.logger.info(
      { boostId: result.boostId, listingId, userId: user.userId },
      'Free weekly boost applied',
    );
    return {
      boostId: result.boostId,
      listingId,
      boostType: FREE_BOOST_TYPE,
      expiresAt: result.expiresAt,
      remaining: result.remaining,
    };
  }
}
