import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { LoggerService } from '../../common/services/logger.service';
import { throwApi } from '../../common/exceptions/api.exception';
import {
  NOTIFICATION_PREF_KEYS,
  normalizeNotificationPrefs,
  type NotificationPrefs,
} from '../../notifications/notification-prefs';
import { describeSessionDevice, maskIp } from '../lib/session-device';
import {
  refreshTokenLookupValues,
  storedRefreshTokenMatches,
} from '../../auth/lib/refresh-token-hash';
import type { UpdateNotificationPrefsDto } from '../dto/user-settings.dto';

const MUTED_LIST_LIMIT = 200;
/** Same default as AuthService (SESSION_TTL_DAYS); used to derive the last refresh time. */
const DEFAULT_SESSION_TTL_DAYS = 30;

function sessionTtlMs(): number {
  const days = parseInt(process.env.SESSION_TTL_DAYS ?? '', 10);
  const safe =
    Number.isFinite(days) && days > 0 ? days : DEFAULT_SESSION_TTL_DAYS;
  return safe * 24 * 60 * 60 * 1000;
}
const EXPORT_LIMIT = 1000;

const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  verified: true,
  verifiedTier: true,
} satisfies Prisma.UserSelect;

/**
 * Settings endpoints added with the settings redesign: per-type notification
 * prefs, muted accounts, connected sessions (read-only), own payments
 * (read-only) and «تحميل بياناتي» (JSON export on demand). Nothing here touches
 * auth, payment flows, webhooks or queue configuration.
 */
@Injectable()
export class UserSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly logger: LoggerService,
  ) {}

  async getNotificationPrefs(userId: string) {
    const row = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      select: { notificationsEnabled: true, notificationPrefs: true },
    });
    if (!row) throwApi(404, 'not_found', 'المستخدم غير موجود');
    return {
      notificationsEnabled: row.notificationsEnabled,
      prefs: normalizeNotificationPrefs(row.notificationPrefs),
    };
  }

  async updateNotificationPrefs(
    userId: string,
    dto: UpdateNotificationPrefsDto,
  ) {
    const patch: Partial<NotificationPrefs> = {};
    for (const key of NOTIFICATION_PREF_KEYS) {
      if (typeof dto[key] === 'boolean') patch[key] = dto[key];
    }
    if (
      Object.keys(patch).length === 0 &&
      dto.notificationsEnabled === undefined
    ) {
      throwApi(400, 'validation_error', 'لا توجد إعدادات للتحديث');
    }
    const current = await this.getNotificationPrefs(userId);
    const prefs = { ...current.prefs, ...patch };
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        notificationPrefs: prefs as unknown as Prisma.InputJsonValue,
        ...(dto.notificationsEnabled !== undefined
          ? { notificationsEnabled: dto.notificationsEnabled }
          : {}),
      },
      select: { notificationsEnabled: true, notificationPrefs: true },
    });
    await this.redis.cacheDel(`user:${userId}`, `user:${userId}:base`);
    this.logger.info({ userId, ...patch }, 'Notification prefs updated');
    return {
      notificationsEnabled: updated.notificationsEnabled,
      prefs: normalizeNotificationPrefs(updated.notificationPrefs),
    };
  }

  async setMute(targetId: string, muterId: string, muted: boolean) {
    if (targetId === muterId) {
      throwApi(400, 'invalid_action', 'لا يمكنك كتم نفسك');
    }
    const target = await this.prisma.user.findFirst({
      where: { id: targetId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!target) throwApi(404, 'not_found', 'المستخدم غير موجود');

    if (muted) {
      await this.prisma.userMute.upsert({
        where: { muterId_mutedId: { muterId, mutedId: targetId } },
        create: { muterId, mutedId: targetId },
        update: {},
      });
    } else {
      await this.prisma.userMute.deleteMany({
        where: { muterId, mutedId: targetId },
      });
    }
    await this.redis.cacheDel(`stories:feed:${muterId}`);
    return { muted };
  }

  async listMuted(muterId: string) {
    const rows = await this.prisma.userMute.findMany({
      where: { muterId },
      orderBy: { createdAt: 'desc' },
      take: MUTED_LIST_LIMIT,
      include: { muted: { select: PUBLIC_USER_SELECT } },
    });
    return {
      users: rows.map((row) => ({
        ...row.muted,
        verifiedTier: row.muted.verifiedTier ?? null,
        mutedAt: row.createdAt,
      })),
    };
  }

  /**
   * «الأجهزة المتصلة»: active refresh-token sessions, read-only. The token itself
   * is never selected; the IP is coarsened. Signing a device out needs an auth
   * change (current-session id), so it is not offered here.
   */
  /**
   * Signed-in devices. `currentRefreshToken` (optional, the caller's own token)
   * marks «هذا الجهاز»; the token itself is never returned. `lastActiveAt` is
   * the last refresh: rotation pushes `expiresAt` to now + session TTL.
   */
  async listSessions(userId: string, currentRefreshToken?: string | null) {
    const rows = await this.prisma.userSession.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        deviceInfo: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
        refreshToken: true,
      },
    });
    const ttlMs = sessionTtlMs();
    const current =
      typeof currentRefreshToken === 'string' && currentRefreshToken.length > 0
        ? currentRefreshToken
        : null;
    return {
      sessions: rows.map((row) => {
        const device = describeSessionDevice(row.deviceInfo);
        const refreshedAt = new Date(row.expiresAt.getTime() - ttlMs);
        return {
          id: row.id,
          label: device.label,
          platform: device.platform,
          ip: maskIp(row.ipAddress),
          signedInAt: row.createdAt,
          lastActiveAt:
            refreshedAt > row.createdAt ? refreshedAt : row.createdAt,
          expiresAt: row.expiresAt,
          current:
            current !== null &&
            storedRefreshTokenMatches(row.refreshToken, current),
        };
      }),
    };
  }

  /** Sign one of the caller's own sessions out (the device must sign in again). */
  async revokeSession(userId: string, sessionId: string) {
    const result = await this.prisma.userSession.deleteMany({
      where: { id: sessionId, userId },
    });
    if (result.count === 0) throwApi(404, 'not_found', 'الجهاز غير موجود');
    this.logger.info({ userId, sessionId }, 'Session revoked by owner');
    return { revoked: result.count };
  }

  /** Sign out every other device, keeping the session that owns `currentRefreshToken`. */
  async revokeOtherSessions(userId: string, currentRefreshToken: string) {
    const keep = await this.prisma.userSession.findFirst({
      where: {
        userId,
        refreshToken: { in: refreshTokenLookupValues(currentRefreshToken) },
      },
      select: { id: true },
    });
    if (!keep)
      throwApi(
        400,
        'session_unknown',
        'تعذّر التعرّف على هذا الجهاز، سجّل الدخول من جديد',
      );
    const result = await this.prisma.userSession.deleteMany({
      where: { userId, id: { not: keep.id } },
    });
    this.logger.info(
      { userId, revoked: result.count },
      'Other sessions revoked by owner',
    );
    return { revoked: result.count };
  }

  /** Own payments history (receipts), read-only; no checkout URLs or gateway metadata. */
  async listPayments(userId: string) {
    const rows = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        orderId: true,
        amount: true,
        currency: true,
        status: true,
        method: true,
        referenceType: true,
        description: true,
        descriptionAr: true,
        paidAt: true,
        createdAt: true,
      },
    });
    return { payments: rows };
  }

  /** «تحميل بياناتي»: the caller's own data as JSON, built on demand. */
  async exportData(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        username: true,
        displayName: true,
        arabicName: true,
        email: true,
        phone: true,
        bio: true,
        about: true,
        website: true,
        profileLinks: true,
        avatar: true,
        coverImage: true,
        country: true,
        birthDate: true,
        verified: true,
        verifiedTier: true,
        rating: true,
        reviewCount: true,
        showInSearch: true,
        allowPrivateMessages: true,
        showFollowingList: true,
        commentsAudience: true,
        privateMessagesAudience: true,
        notificationsEnabled: true,
        notificationPrefs: true,
        createdAt: true,
      },
    });
    if (!user) throwApi(404, 'not_found', 'المستخدم غير موجود');

    const take = EXPORT_LIMIT;
    const [
      subscription,
      listings,
      posts,
      postComments,
      listingComments,
      following,
      followers,
      blocks,
      mutes,
      reviewsGiven,
      payments,
      tickets,
      sessions,
    ] = await Promise.all([
      this.prisma.subscription.findUnique({
        where: { userId },
        select: {
          planId: true,
          status: true,
          billingCycle: true,
          renewDate: true,
          autoRenew: true,
        },
      }),
      this.prisma.listing.findMany({
        where: { sellerId: userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          arabicTitle: true,
          title: true,
          arabicDescription: true,
          price: true,
          currency: true,
          category: true,
          quantity: true,
          arabicLocation: true,
          status: true,
          views: true,
          createdAt: true,
        },
      }),
      this.prisma.post.findMany({
        where: { authorId: userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          content: true,
          image: true,
          likesCount: true,
          commentsCount: true,
          createdAt: true,
        },
      }),
      this.prisma.postComment.findMany({
        where: { authorId: userId },
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, postId: true, content: true, createdAt: true },
      }),
      this.prisma.listingComment.findMany({
        where: { authorId: userId },
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, listingId: true, content: true, createdAt: true },
      }),
      this.prisma.follow.findMany({
        where: { followerId: userId },
        take,
        select: {
          createdAt: true,
          following: { select: { id: true, username: true } },
        },
      }),
      this.prisma.follow.findMany({
        where: { followingId: userId },
        take,
        select: {
          createdAt: true,
          follower: { select: { id: true, username: true } },
        },
      }),
      this.prisma.userBlock.findMany({
        where: { blockerId: userId },
        select: {
          createdAt: true,
          blocked: { select: { id: true, username: true } },
        },
      }),
      this.prisma.userMute.findMany({
        where: { muterId: userId },
        select: {
          createdAt: true,
          muted: { select: { id: true, username: true } },
        },
      }),
      this.prisma.userReview.findMany({
        where: { reviewerId: userId },
        select: { targetId: true, rating: true, createdAt: true },
      }),
      this.listPayments(userId).then((r) => r.payments),
      this.prisma.supportTicket.findMany({
        where: { reporterId: userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          ticketNumber: true,
          category: true,
          subject: true,
          status: true,
          createdAt: true,
        },
      }),
      this.listSessions(userId).then((r) => r.sessions),
    ]);

    this.logger.info({ userId }, 'User data export generated');
    return {
      format: 'sarh-data-export',
      version: 1,
      generatedAt: new Date().toISOString(),
      account: {
        ...user,
        birthDate: user.birthDate?.toISOString().slice(0, 10) ?? null,
        notificationPrefs: normalizeNotificationPrefs(user.notificationPrefs),
      },
      subscription,
      listings,
      posts,
      comments: { posts: postComments, listings: listingComments },
      following: following.map((f) => ({ ...f.following, since: f.createdAt })),
      followers: followers.map((f) => ({ ...f.follower, since: f.createdAt })),
      blocked: blocks.map((b) => ({ ...b.blocked, since: b.createdAt })),
      muted: mutes.map((m) => ({ ...m.muted, since: m.createdAt })),
      reviewsGiven,
      payments,
      supportTickets: tickets,
      sessions,
    };
  }
}
