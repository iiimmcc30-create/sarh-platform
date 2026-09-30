import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { LoggerService } from '../../common/services/logger.service';
import { hasPaidAccess } from '../../lib/subscription-lifecycle';
import {
  effectiveApprovedTier,
  resolveBadgeTier,
  tierForPlanSlug,
  type VerificationTier,
} from './verification-tiers';

export type BadgeSyncResult = {
  verified: boolean;
  verifiedTier: VerificationTier | null;
  changed: boolean;
};

/**
 * Keeps the public badge (`User.verified` + `User.verifiedTier`) in line with
 * the rules: Blue = active Blue subscription (no verification needed); Gold =
 * active Gold subscription AND approved Gold verification. Badges that
 * pre-date this system (verified = true, subscriptionBadge = false) are never
 * revoked here.
 */
@Injectable()
export class VerificationBadgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly logger: LoggerService,
  ) {}

  /** Pure decision used by `sync` (exported for tests). */
  static decide(input: {
    user: {
      verified: boolean;
      verifiedTier: string | null;
      subscriptionBadge: boolean;
    };
    request: { status?: string | null; approvedTier?: string | null } | null;
    subscription: {
      planId: string;
      renewDate: Date;
      autoRenew: boolean;
    } | null;
    now?: Date;
  }): {
    verified: boolean;
    verifiedTier: VerificationTier | null;
    subscriptionBadge: boolean;
  } {
    const { user, subscription } = input;
    const approvedTier = effectiveApprovedTier(input.request);
    const subscriptionTier =
      subscription && hasPaidAccess(subscription, input.now ?? new Date())
        ? tierForPlanSlug(subscription.planId)
        : null;
    const badgeTier = resolveBadgeTier({ subscriptionTier, approvedTier });
    const legacyVerified = user.verified && !user.subscriptionBadge;

    if (badgeTier) {
      return {
        verified: true,
        verifiedTier: badgeTier,
        // A legacy badge stays legacy (it must survive the subscription ending).
        subscriptionBadge: !legacyVerified,
      };
    }
    if (legacyVerified) {
      // Keep the legacy badge as it was displayed before (blue).
      return { verified: true, verifiedTier: null, subscriptionBadge: false };
    }
    return { verified: false, verifiedTier: null, subscriptionBadge: false };
  }

  async sync(userId: string): Promise<BadgeSyncResult | null> {
    const [user, request, subscription] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { verified: true, verifiedTier: true, subscriptionBadge: true },
      }),
      this.prisma.accountVerificationRequest.findUnique({
        where: { userId },
        select: { status: true, approvedTier: true },
      }),
      this.prisma.subscription.findUnique({
        where: { userId },
        select: { planId: true, renewDate: true, autoRenew: true },
      }),
    ]);
    if (!user) return null;

    const next = VerificationBadgeService.decide({
      user,
      request,
      subscription,
    });

    const changed =
      next.verified !== user.verified ||
      next.verifiedTier !== (user.verifiedTier ?? null) ||
      next.subscriptionBadge !== user.subscriptionBadge;

    if (changed) {
      await this.prisma.user.update({
        where: { id: userId },
        data: next,
      });
      await this.cache
        .del(`user:${userId}`, `user:${userId}:base`)
        .catch(() => 0);
      this.logger.info(
        { userId, verified: next.verified, verifiedTier: next.verifiedTier },
        'Verification badge synced',
      );
    }

    return {
      verified: next.verified,
      verifiedTier: next.verifiedTier,
      changed,
    };
  }

  /** Best-effort variant for lifecycle hooks (never throws). */
  async syncQuietly(userId: string): Promise<void> {
    try {
      await this.sync(userId);
    } catch (err) {
      this.logger.warn(
        { userId, err: err instanceof Error ? err.message : String(err) },
        'Verification badge sync failed',
      );
    }
  }
}
