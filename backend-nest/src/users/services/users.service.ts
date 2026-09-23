import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { RedisService } from '../../redis/redis.service';
import { LoggerService } from '../../common/services/logger.service';
import { SocketDisconnectService } from '../../gateway/services/socket-disconnect.service';
import { throwApi, ApiException } from '../../common/exceptions/api.exception';
import { AppNotificationsService } from '../../queue/services/app-notifications.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { UsersRepository } from '../repositories/users.repository';
import {
  ChangePhoneDto,
  ConnectionsQueryDto,
  ListUsersQueryDto,
  UpdateAccountSettingsDto,
  UpdatePrivacySettingsDto,
  UpdateUserDto,
} from '../dto/users.dto';
import {
  PROFILE_CHANGE_ERRORS,
  cooldownPayload,
  planProfileIdentityUpdate,
} from '../lib/profile-change-cooldown';

const MIN_RATING = 1;
const MAX_RATING = 5;

const PAGE_SIZE = 50;
const PROFILE_CACHE_TTL = 300;

type ProfileUser = NonNullable<
  Awaited<ReturnType<UsersRepository['findUserProfile']>>
>;

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly redis: RedisService,
    private readonly logger: LoggerService,
    private readonly socketDisconnect: SocketDisconnectService,
    private readonly notifications: AppNotificationsService,
    private readonly config: ConfigService,
  ) {}

  async listUsers(query: ListUsersQueryDto) {
    const users = await this.repo.findActiveUsers(query.search);
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      arabicName: u.arabicName,
      avatar: u.avatar,
      verified: u.verified,
      bio: u.bio,
      country: u.country,
      followers: u._count.followers,
    }));
  }

  async getUser(id: string, viewer?: JwtPayload) {
    if (!id) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    // Cache shared profile fields only — never cache viewer-specific isFollowing
    // Key versioned so stale entries that baked in isFollowing are ignored
    const cacheKey = `user:${id}:base`;
    let base = await this.redis.cacheGet<Record<string, unknown>>(cacheKey);
    if (!base) {
      const user = await this.repo.findUserProfile(id);
      if (!user) throwApi(404, 'not_found', 'المستخدم غير موجود');
      base = this.formatProfile(user);
      await this.redis.cacheSet(cacheKey, base, PROFILE_CACHE_TTL);
    }

    let isFollowing = false;
    let myRating: number | null = null;
    let isBlocked = false;
    if (viewer?.userId && viewer.userId !== id) {
      const blockedByViewer = await this.repo.findBlock(viewer.userId, id);
      const blockedViewer = await this.repo.findBlock(id, viewer.userId);
      if (blockedViewer) {
        throwApi(403, 'blocked', 'لا يمكنك عرض هذا الملف');
      }
      isBlocked = !!blockedByViewer;

      const [follow, review] = await Promise.all([
        this.repo.findFollow(viewer.userId, id),
        this.repo.findUserRating(id, viewer.userId),
      ]);
      isFollowing = !!follow;
      myRating = review?.rating ?? null;
      this.logger.debug(
        {
          viewerId: viewer.userId,
          profileUserId: id,
          isFollowing,
          followRecordId: follow?.id ?? null,
        },
        'Profile follow state resolved from database',
      );
    } else {
      this.logger.debug(
        {
          viewerId: viewer?.userId ?? null,
          profileUserId: id,
          isFollowing: false,
          reason: viewer?.userId === id ? 'self_profile' : 'anonymous_viewer',
        },
        'Profile follow state resolved without relationship lookup',
      );
    }

    return {
      ...base,
      isFollowing,
      myRating,
      isBlocked,
      ...(viewer?.userId === id ? await this.ownProfileExtras(id) : {}),
    };
  }

  async isUsernameAvailable(username: string, userId: string) {
    const conflict = await this.repo.findByUsername(username, userId);
    return { available: !conflict };
  }

  async updateUser(id: string, user: JwtPayload, dto: UpdateUserDto) {
    if (id !== user.userId && user.role !== 'ADMIN') {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    if (dto.email) {
      const conflict = await this.repo.findUserByEmail(dto.email, id);
      if (conflict) {
        throwApi(409, 'email_taken', 'البريد الإلكتروني مستخدم بالفعل');
      }
    }

    let birthDate: Date | null | undefined;
    if (dto.birthDate !== undefined) {
      if (dto.birthDate === null) {
        birthDate = null;
      } else {
        const parsed = new Date(dto.birthDate);
        if (Number.isNaN(parsed.getTime())) {
          throwApi(400, 'validation_error', 'تاريخ الميلاد غير صالح');
        }
        birthDate = parsed;
      }
    }

    try {
      const {
        fcmToken,
        unregisterFcm,
        fcmPlatform,
        birthDate: _bd,
        email,
        ...profileData
      } = dto;
      const baseData = {
        ...profileData,
        ...(email !== undefined ? { email } : {}),
        ...(birthDate !== undefined ? { birthDate } : {}),
        ...(dto.privateMessagesAudience !== undefined
          ? { allowPrivateMessages: true }
          : {}),
        ...(fcmToken !== undefined && !unregisterFcm ? { fcmToken } : {}),
      };
      const identityPatch =
        dto.username !== undefined ||
        dto.displayName !== undefined ||
        dto.arabicName !== undefined;

      const updated = identityPatch
        ? await this.applyIdentityUpdate(id, dto, baseData)
        : await this.repo.updateUser(id, baseData);

      if (unregisterFcm && typeof fcmToken === 'string' && fcmToken.trim()) {
        await this.repo.deleteDeviceToken(id, fcmToken.trim());
        const current = await this.repo.findUserById(id, { fcmToken: true });
        if (current?.fcmToken === fcmToken.trim()) {
          await this.repo.updateUser(id, { fcmToken: null });
        }
      } else if (typeof fcmToken === 'string' && fcmToken.trim()) {
        await this.repo.upsertDeviceToken(id, fcmToken.trim(), fcmPlatform);
      }

      await this.redis.cacheDel(`user:${id}`, `user:${id}:base`);
      this.logger.info({ userId: id }, 'User profile updated');

      return this.formatUpdateResult(updated);
    } catch (err: unknown) {
      if (err instanceof ApiException) throw err;
      const prismaErr = err as { code?: string };
      if (prismaErr.code === 'P2002') {
        throwApi(
          409,
          PROFILE_CHANGE_ERRORS.USERNAME_TAKEN,
          'اسم المستخدم محجوز',
        );
      }
      throw err;
    }
  }

  async deleteUser(id: string, user: JwtPayload) {
    if (id !== user.userId && user.role !== 'ADMIN') {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    await this.repo.deactivateUser(id);
    await this.socketDisconnect.disconnectUser(id);
    await this.redis.cacheDel(`user:${id}`, `user:${id}:base`);
    this.logger.info(
      { userId: id, by: user.userId },
      'User account deactivated',
    );
    return { deleted: true };
  }

  async setFollow(targetId: string, followerId: string, following: boolean) {
    if (targetId === followerId) {
      throwApi(400, 'invalid_action', 'لا يمكنك متابعة نفسك');
    }

    const target = await this.repo.findUserById(targetId, {
      id: true,
      arabicName: true,
    });
    if (!target) throwApi(404, 'not_found', 'المستخدم غير موجود');

    const [blockedByFollower, blockedFollower] = await Promise.all([
      this.repo.findBlock(followerId, targetId),
      this.repo.findBlock(targetId, followerId),
    ]);
    if (blockedByFollower || blockedFollower) {
      throwApi(403, 'blocked', 'لا يمكنك التفاعل مع هذا المستخدم');
    }

    const existing = await this.repo.findFollow(followerId, targetId);
    if (!following) {
      if (existing) {
        await this.repo.deleteFollow(followerId, targetId);
      }
      await this.invalidateFollowProfiles(followerId, targetId);
      this.logger.info(
        {
          followerId,
          targetId,
          following: false,
          deletedFollowId: existing?.id ?? null,
          changed: !!existing,
        },
        'User follow state persisted and profile caches invalidated',
      );
      return { following: false };
    }

    const created = await this.repo.upsertFollow(followerId, targetId);

    // Only send a notification when a relationship was newly created.
    if (!existing) {
      const follower = await this.repo.findUserById(followerId, {
        arabicName: true,
        avatar: true,
      });

      void this.notifications.notifyUser({
        userId: targetId,
        type: 'follow',
        titleAr: 'متابع جديد',
        bodyAr: `${follower?.arabicName || 'مستخدم'} بدأ متابعتك`,
        data: { actorId: followerId, actorAvatar: follower?.avatar },
      });
    }

    await this.invalidateFollowProfiles(followerId, targetId);
    this.logger.info(
      {
        followerId,
        targetId,
        following: true,
        followRecordId: created.id,
        changed: !existing,
      },
      'User follow state persisted and profile caches invalidated',
    );
    return { following: true };
  }

  async setBlock(targetId: string, blockerId: string, blocked: boolean) {
    if (targetId === blockerId) {
      throwApi(400, 'invalid_action', 'لا يمكنك حظر نفسك');
    }

    const target = await this.repo.findActiveUserId(targetId);
    if (!target) throwApi(404, 'not_found', 'المستخدم غير موجود');

    const existing = await this.repo.findBlock(blockerId, targetId);
    if (!blocked) {
      if (existing) {
        await this.repo.deleteBlock(blockerId, targetId);
      }
      await this.invalidateBlockProfiles(blockerId, targetId);
      return { blocked: false };
    }

    if (!existing) {
      await this.repo.createBlock(blockerId, targetId);
      await this.repo.deleteFollowIfExists(blockerId, targetId);
      await this.repo.deleteFollowIfExists(targetId, blockerId);
    }

    await this.invalidateBlockProfiles(blockerId, targetId);
    return { blocked: true };
  }

  async listBlocked(blockerId: string) {
    const rows = await this.repo.findBlockedUsers(blockerId);
    return {
      users: rows.map((row) => ({
        id: row.blocked.id,
        username: row.blocked.username,
        displayName: row.blocked.displayName,
        arabicName: row.blocked.arabicName,
        avatar: row.blocked.avatar,
        verified: row.blocked.verified,
        blockedAt: row.createdAt,
      })),
    };
  }

  async getPrivacySettings(userId: string) {
    const settings = await this.repo.findPrivacySettings(userId);
    if (!settings) throwApi(404, 'not_found', 'المستخدم غير موجود');
    return settings;
  }

  async getAccountSettings(userId: string) {
    const account = await this.repo.findAccountSettings(userId);
    if (!account) throwApi(404, 'not_found', 'المستخدم غير موجود');
    return {
      phone: account.phone,
      email: account.email,
      birthDate: account.birthDate?.toISOString().slice(0, 10) ?? null,
    };
  }

  async updateAccountSettings(userId: string, dto: UpdateAccountSettingsDto) {
    if (dto.email === undefined && dto.birthDate === undefined) {
      throwApi(400, 'validation_error', 'لا توجد بيانات للتحديث');
    }

    if (dto.email) {
      const conflict = await this.repo.findUserByEmail(dto.email, userId);
      if (conflict) {
        throwApi(409, 'email_taken', 'البريد الإلكتروني مستخدم بالفعل');
      }
    }

    let birthDate: Date | null | undefined;
    if (dto.birthDate !== undefined) {
      if (dto.birthDate === null) {
        birthDate = null;
      } else {
        const parsed = new Date(dto.birthDate);
        if (Number.isNaN(parsed.getTime())) {
          throwApi(400, 'validation_error', 'تاريخ الميلاد غير صالح');
        }
        birthDate = parsed;
      }
    }

    const updated = await this.repo.updateAccountSettings(userId, {
      ...(dto.email !== undefined ? { email: dto.email } : {}),
      ...(birthDate !== undefined ? { birthDate } : {}),
    });
    await this.redis.cacheDel(`user:${userId}`, `user:${userId}:base`);
    this.logger.info({ userId }, 'User account settings updated');
    return {
      phone: updated.phone,
      email: updated.email,
      birthDate: updated.birthDate?.toISOString().slice(0, 10) ?? null,
    };
  }

  async changePhone(userId: string, dto: ChangePhoneDto) {
    try {
      const decoded = jwt.verify(
        dto.phone_token,
        this.config.get<string>('JWT_SECRET')!,
      ) as { phone: string; verified: boolean };
      if (!decoded.verified || decoded.phone !== dto.phone) {
        throwApi(
          400,
          'invalid_phone_token',
          'رمز تحقق الجوال غير صحيح أو لا يطابق رقم الجوال',
        );
      }
    } catch (err) {
      if (err instanceof ApiException) throw err;
      throwApi(
        400,
        'invalid_phone_token',
        'رمز تحقق الجوال منتهي الصلاحية أو غير صحيح',
      );
    }

    const conflict = await this.repo.findUserByPhone(dto.phone, userId);
    if (conflict) {
      throwApi(409, 'phone_taken', 'رقم الجوال مسجّل بالفعل');
    }

    const updated = await this.repo.updateAccountSettings(userId, {
      phone: dto.phone,
    });
    await this.redis.cacheDel(`user:${userId}`, `user:${userId}:base`);
    this.logger.info({ userId }, 'User phone updated');
    return {
      phone: updated.phone,
      email: updated.email,
      birthDate: updated.birthDate?.toISOString().slice(0, 10) ?? null,
    };
  }

  async updatePrivacySettings(userId: string, dto: UpdatePrivacySettingsDto) {
    if (
      dto.showInSearch === undefined &&
      dto.allowPrivateMessages === undefined &&
      dto.showFollowingList === undefined &&
      dto.commentsAudience === undefined &&
      dto.privateMessagesAudience === undefined &&
      dto.notificationsEnabled === undefined
    ) {
      throwApi(400, 'validation_error', 'لا توجد إعدادات للتحديث');
    }

    const patch: Parameters<UsersRepository['updatePrivacySettings']>[1] = {
      ...dto,
    };
    if (dto.privateMessagesAudience !== undefined) {
      patch.allowPrivateMessages = true;
    }

    const updated = await this.repo.updatePrivacySettings(userId, patch);
    await this.redis.cacheDel(`user:${userId}`, `user:${userId}:base`);
    this.logger.info({ userId, ...dto }, 'User privacy settings updated');
    return updated;
  }

  private invalidateBlockProfiles(blockerId: string, targetId: string) {
    return this.redis.cacheDel(
      `user:${blockerId}`,
      `user:${blockerId}:base`,
      `user:${targetId}`,
      `user:${targetId}:base`,
    );
  }

  private invalidateFollowProfiles(followerId: string, targetId: string) {
    return this.redis.cacheDel(
      `user:${followerId}`,
      `user:${followerId}:base`,
      `user:${targetId}`,
      `user:${targetId}:base`,
    );
  }

  async getConnections(
    id: string,
    query: ConnectionsQueryDto,
    viewer?: JwtPayload,
  ) {
    const type = query.type ?? 'followers';

    if (!id) throwApi(400, 'invalid_id', 'معرّف غير صالح');
    if (type !== 'followers' && type !== 'following') {
      throwApi(400, 'invalid_type', 'نوع القائمة غير صالح');
    }

    const target = await this.repo.findActiveUserId(id);
    if (!target) throwApi(404, 'not_found', 'المستخدم غير موجود');

    if (type === 'following') {
      const privacy = await this.repo.findUserPrivacyFlags(id);
      const isOwner = viewer?.userId === id;
      if (privacy && !privacy.showFollowingList && !isOwner) {
        return { type, users: [], hidden: true };
      }
    }

    const rows =
      type === 'followers'
        ? await this.repo.findFollowers(id, PAGE_SIZE)
        : await this.repo.findFollowing(id, PAGE_SIZE);

    const users = rows.map((row) =>
      'follower' in row ? row.follower : row.following,
    );

    let followingSet = new Set<string>();
    if (viewer?.userId && users.length > 0) {
      const myFollows = await this.repo.findFollowsByViewer(
        viewer.userId,
        users.map((u) => u.id),
      );
      followingSet = new Set(myFollows.map((f) => f.followingId));
    }

    this.logger.debug(
      {
        profileUserId: id,
        viewerId: viewer?.userId ?? null,
        connectionType: type,
        resultCount: users.length,
        viewerFollowingCount: followingSet.size,
      },
      'Connection follow states resolved from database',
    );

    return {
      type,
      users: users.map((u) => ({
        ...u,
        isFollowing: viewer?.userId === u.id ? false : followingSet.has(u.id),
      })),
    };
  }

  private resolveAccountType(
    user: ProfileUser,
  ): 'USER' | 'BUTCHER' | 'LIVESTOCK_TRADER' {
    if (user.role === 'BUTCHER' || user.butcherProfile) return 'BUTCHER';
    if (user._count.listings > 0) return 'LIVESTOCK_TRADER';
    return 'USER';
  }

  private async ownProfileExtras(id: string) {
    const [privacy, change] = await Promise.all([
      this.repo.findPrivacySettings(id),
      this.repo.findUserChangeState(id),
    ]);
    return {
      ...(privacy ?? {}),
      ...cooldownPayload(change?.nameChangedAt, change?.usernameChangedAt),
    };
  }

  private async applyIdentityUpdate(
    id: string,
    dto: UpdateUserDto,
    baseData: Record<string, unknown>,
  ) {
    const updated = await this.repo.updateUserLocked(
      id,
      async (current, tx) => {
        const planned = planProfileIdentityUpdate(
          current,
          {
            username: dto.username,
            displayName: dto.displayName,
            arabicName: dto.arabicName,
          },
          new Date(),
        );
        if (!planned.ok) {
          throwApi(
            planned.status,
            planned.error,
            planned.messageAr,
            planned.details,
          );
        }

        if (planned.data.username) {
          const conflict = await tx.user.findFirst({
            where: {
              username: { equals: planned.data.username, mode: 'insensitive' },
              isActive: true,
              id: { not: id },
            },
            select: { id: true },
          });
          if (conflict) {
            throwApi(
              409,
              PROFILE_CHANGE_ERRORS.USERNAME_TAKEN,
              'اسم المستخدم محجوز',
            );
          }
        }

        const {
          username: _ignoreUsername,
          displayName: _ignoreDisplayName,
          arabicName: _ignoreArabicName,
          ...rest
        } = baseData as {
          username?: string;
          displayName?: string;
          arabicName?: string;
          [key: string]: unknown;
        };

        return {
          ...rest,
          ...planned.data,
        };
      },
    );

    if (!updated) throwApi(404, 'not_found', 'المستخدم غير موجود');
    return updated;
  }

  private formatUpdateResult(
    updated: Awaited<ReturnType<UsersRepository['updateUser']>>,
  ) {
    return {
      id: updated.id,
      username: updated.username,
      displayName: updated.displayName,
      arabicName: updated.arabicName,
      avatar: updated.avatar,
      coverImage: updated.coverImage,
      bio: updated.bio,
      verified: updated.verified,
      country: updated.country,
      rating: updated.reviewCount > 0 ? updated.rating : null,
      reviewCount: updated.reviewCount,
      followersCount: updated._count.followers,
      followingCount: updated._count.following,
      showInSearch: updated.showInSearch,
      allowPrivateMessages: updated.allowPrivateMessages,
      showFollowingList: updated.showFollowingList,
      commentsAudience: updated.commentsAudience,
      privateMessagesAudience: updated.privateMessagesAudience,
      notificationsEnabled: updated.notificationsEnabled,
      email: updated.email,
      birthDate: updated.birthDate?.toISOString().slice(0, 10) ?? null,
      ...cooldownPayload(updated.nameChangedAt, updated.usernameChangedAt),
    };
  }

  private formatProfile(user: ProfileUser) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      arabicName: user.arabicName,
      avatar: user.avatar,
      coverImage: user.coverImage,
      bio: user.bio,
      verified: user.verified,
      isAI: user.isAI ?? false,
      country: user.country,
      role: user.role,
      accountType: this.resolveAccountType(user),
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
      rating: user.reviewCount > 0 ? user.rating : null,
      reviewCount: user.reviewCount,
      allowPrivateMessages: user.allowPrivateMessages,
      showFollowingList: user.showFollowingList,
      followersCount: user._count.followers,
      followingCount: user._count.following,
      listingsCount: user._count.listings,
      postsCount: user._count.posts,
    };
  }

  /** Rate another user's account (1–5). One review per reviewer, editable. */
  async rateUser(targetId: string, reviewerId: string, rating: number) {
    if (targetId === reviewerId) {
      throwApi(400, 'invalid_action', 'لا يمكنك تقييم حسابك الخاص');
    }
    if (
      !Number.isInteger(rating) ||
      rating < MIN_RATING ||
      rating > MAX_RATING
    ) {
      throwApi(400, 'invalid_rating', 'التقييم يجب أن يكون بين 1 و 5');
    }

    const target = await this.repo.findActiveUserId(targetId);
    if (!target) throwApi(404, 'not_found', 'المستخدم غير موجود');

    await this.repo.upsertUserRating(targetId, reviewerId, rating);

    const agg = await this.repo.aggregateUserRating(targetId);
    const avg = agg._avg.rating ?? 0;
    const count = agg._count.rating;
    await this.repo.updateUserRatingCache(targetId, avg, count);
    await this.redis.cacheDel(`user:${targetId}`, `user:${targetId}:base`);

    this.logger.info({ targetId, reviewerId, rating }, 'User account rated');

    return {
      rating: count > 0 ? avg : null,
      reviewCount: count,
      myRating: rating,
    };
  }
}
