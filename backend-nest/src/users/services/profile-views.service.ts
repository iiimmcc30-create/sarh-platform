import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { LoggerService } from '../../common/services/logger.service';
import { SubscriptionEntitlementService } from '../../subscriptions/services/subscription-entitlement.service';
import {
  activeSubscriberTier,
  canSeeProfileViewers,
} from '../../subscriptions/perks/subscriber-perks';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';

export const PROFILE_VIEWS_WINDOW_DAYS = 30;
export const PROFILE_VIEWS_LIST_LIMIT = 100;
/** Repeat opens of the same profile write at most once per this window. */
const RECORD_THROTTLE_SEC = 10 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC calendar day (dedupe key: one row per viewer per profile per day). */
export function profileViewDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Viewers that may be listed: active, not deleted, not hidden from search
 * («إظهار الحساب في البحث» off = never listed) and no block either way. Same
 * public identity fields every feed already shows.
 */
function listableViewerWhere(profileId: string) {
  return {
    isActive: true,
    deletedAt: null,
    showInSearch: true,
    blocksInitiated: { none: { blockedId: profileId } },
    blocksReceived: { none: { blockerId: profileId } },
  };
}

const VIEWER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  verified: true,
  verifiedTier: true,
} as const;

@Injectable()
export class ProfileViewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly entitlements: SubscriptionEntitlementService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Records a profile view (fire-and-forget from GET /users/:id). Never for
   * self views, anonymous visitors or staff accounts. Blocked pairs are already
   * rejected by the profile endpoint (403) and filtered again when listing.
   */
  async record(
    profileId: string,
    viewer: JwtPayload | undefined,
    now = new Date(),
  ) {
    if (!viewer?.userId || viewer.userId === profileId) return;
    if (viewer.role && viewer.role !== 'USER') return;
    const day = profileViewDay(now);
    const key = `pv:${profileId}:${viewer.userId}:${day.toISOString().slice(0, 10)}`;
    if (!(await this.cache.claimOnce(key, RECORD_THROTTLE_SEC))) return;
    try {
      await this.prisma.profileView.upsert({
        where: {
          profileId_viewerId_day: { profileId, viewerId: viewer.userId, day },
        },
        create: { profileId, viewerId: viewer.userId, day, viewedAt: now },
        update: { viewedAt: now },
      });
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err), profileId },
        'profile view not recorded',
      );
    }
  }

  /**
   * «مين شاف ملفي» for the signed-in owner: unique viewers in the last 30 days.
   * Subscribers (Blue / Blue+ / Gold, checked here on the server) get the list;
   * everyone else only gets the count (`locked: true`, no identities sent).
   */
  async listForOwner(ownerId: string, now = new Date()) {
    const since = new Date(now.getTime() - PROFILE_VIEWS_WINDOW_DAYS * DAY_MS);
    const tier = await activeSubscriberTier(this.entitlements, ownerId);
    const unlocked = canSeeProfileViewers(tier);

    const where = {
      profileId: ownerId,
      viewedAt: { gte: since },
      viewer: listableViewerWhere(ownerId),
    };
    const distinct = await this.prisma.profileView.findMany({
      where,
      distinct: ['viewerId'],
      select: { viewerId: true },
      take: 5000,
    });
    const total = distinct.length;

    if (!unlocked) {
      return {
        locked: true,
        windowDays: PROFILE_VIEWS_WINDOW_DAYS,
        total,
        viewers: [] as unknown[],
      };
    }

    const rows = await this.prisma.profileView.findMany({
      where,
      orderBy: [{ viewedAt: 'desc' }, { id: 'desc' }],
      take: PROFILE_VIEWS_LIST_LIMIT * 4,
      select: { viewedAt: true, viewer: { select: VIEWER_SELECT } },
    });
    const seen = new Set<string>();
    const viewers: Array<{
      user: (typeof rows)[number]['viewer'];
      viewedAt: Date;
    }> = [];
    for (const row of rows) {
      if (seen.has(row.viewer.id)) continue;
      seen.add(row.viewer.id);
      viewers.push({ user: row.viewer, viewedAt: row.viewedAt });
      if (viewers.length >= PROFILE_VIEWS_LIST_LIMIT) break;
    }
    return {
      locked: false,
      windowDays: PROFILE_VIEWS_WINDOW_DAYS,
      total,
      viewers,
    };
  }
}
