import { Injectable } from '@nestjs/common';
import { Country, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { softDeleteFields } from '../../common/utils/soft-delete.util';

const listUserSelect = {
  id: true,
  username: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  verified: true,
  isAI: true,
  bio: true,
  country: true,
  _count: {
    select: { followers: true },
  },
} satisfies Prisma.UserSelect;

const profileSelect = {
  id: true,
  username: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  coverImage: true,
  bio: true,
  verified: true,
  isAI: true,
  country: true,
  role: true,
  rating: true,
  reviewCount: true,
  showInSearch: true,
  allowPrivateMessages: true,
  showFollowingList: true,
  createdAt: true,
  lastSeenAt: true,
  butcherProfile: {
    select: { id: true },
  },
  _count: {
    select: { followers: true, following: true, listings: true, posts: true },
  },
} satisfies Prisma.UserSelect;

const connectionUserSelect = {
  id: true,
  username: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  verified: true,
} satisfies Prisma.UserSelect;

const changeStateSelect = {
  username: true,
  displayName: true,
  arabicName: true,
  nameChangedAt: true,
  usernameChangedAt: true,
} satisfies Prisma.UserSelect;

const updateUserSelect = {
  id: true,
  username: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  coverImage: true,
  bio: true,
  verified: true,
  country: true,
  rating: true,
  reviewCount: true,
  showInSearch: true,
  allowPrivateMessages: true,
  showFollowingList: true,
  commentsAudience: true,
  privateMessagesAudience: true,
  notificationsEnabled: true,
  email: true,
  birthDate: true,
  nameChangedAt: true,
  usernameChangedAt: true,
  _count: {
    select: { followers: true, following: true },
  },
} satisfies Prisma.UserSelect;

type UpdateUserData = {
  username?: string;
  displayName?: string;
  arabicName?: string;
  bio?: string;
  avatar?: string;
  coverImage?: string;
  country?: Country;
  fcmToken?: string | null;
  showInSearch?: boolean;
  allowPrivateMessages?: boolean;
  showFollowingList?: boolean;
  commentsAudience?: string;
  privateMessagesAudience?: string;
  notificationsEnabled?: boolean;
  email?: string | null;
  birthDate?: Date | null;
  nameChangedAt?: Date;
  usernameChangedAt?: Date;
};

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveUsers(search?: string) {
    const where: Prisma.UserWhereInput = {
      isActive: true,
      showInSearch: true,
    };
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
        { arabicName: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.user.findMany({
      where,
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: listUserSelect,
    });
  }

  findUserProfile(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: profileSelect,
    });
  }

  findFollow(followerId: string, followingId: string) {
    return this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
      select: { id: true },
    });
  }

  findByUsername(username: string, excludeUserId?: string) {
    return this.prisma.user.findFirst({
      where: {
        username: { equals: username, mode: 'insensitive' },
        isActive: true,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
  }

  findUserChangeState(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: changeStateSelect,
    });
  }

  updateUser(id: string, data: UpdateUserData) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: updateUserSelect,
    });
  }

  /**
   * Serialize identity updates so cooldown + timestamp write cannot race.
   * Unique(username) remains the final uniqueness guard.
   */
  updateUserLocked(
    id: string,
    apply: (
      current: {
        username: string;
        displayName: string;
        arabicName: string;
        nameChangedAt: Date | null;
        usernameChangedAt: Date | null;
      },
      tx: Prisma.TransactionClient,
    ) => Promise<UpdateUserData> | UpdateUserData,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE id = ${id} FOR UPDATE`;
      const current = await tx.user.findUnique({
        where: { id },
        select: changeStateSelect,
      });
      if (!current) return null;
      const data = await apply(current, tx);
      return tx.user.update({
        where: { id },
        data,
        select: updateUserSelect,
      });
    });
  }

  upsertDeviceToken(userId: string, token: string, platform?: string | null) {
    return this.prisma.userDeviceToken.upsert({
      where: { token },
      create: {
        userId,
        token,
        platform: platform ?? null,
        lastSeenAt: new Date(),
      },
      update: {
        userId,
        platform: platform ?? undefined,
        lastSeenAt: new Date(),
      },
    });
  }

  deleteDeviceToken(userId: string, token: string) {
    return this.prisma.userDeviceToken.deleteMany({
      where: { userId, token },
    });
  }

  listDeviceTokens(userId: string) {
    return this.prisma.userDeviceToken.findMany({
      take: 50,
      where: { userId },
      select: { token: true },
    });
  }

  deactivateUser(id: string) {
    return this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          isActive: false,
          ...softDeleteFields(),
          email: `deleted_${Date.now()}@safat.deleted`,
          fcmToken: null,
        },
      }),
      this.prisma.userDeviceToken.deleteMany({ where: { userId: id } }),
      this.prisma.userSession.deleteMany({ where: { userId: id } }),
    ]);
  }

  findUserById(id: string, select: Prisma.UserSelect) {
    return this.prisma.user.findUnique({ where: { id }, select });
  }

  findActiveUserId(id: string) {
    return this.prisma.user.findFirst({
      where: { id, isActive: true, deletedAt: null },
      select: { id: true },
    });
  }

  deleteFollow(followerId: string, followingId: string) {
    return this.prisma.follow.delete({
      where: { followerId_followingId: { followerId, followingId } },
    });
  }

  upsertFollow(followerId: string, followingId: string) {
    return this.prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      update: {},
      create: { followerId, followingId },
    });
  }

  findFollowers(id: string, take: number) {
    return this.prisma.follow.findMany({
      where: { followingId: id },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        follower: { select: connectionUserSelect },
      },
    });
  }

  findFollowing(id: string, take: number) {
    return this.prisma.follow.findMany({
      where: { followerId: id },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        following: { select: connectionUserSelect },
      },
    });
  }

  findFollowsByViewer(viewerId: string, followingIds: string[]) {
    return this.prisma.follow.findMany({
      take: Math.max(followingIds.length, 1),
      where: {
        followerId: viewerId,
        followingId: { in: followingIds },
      },
      select: { followingId: true },
    });
  }

  findUserRating(targetId: string, reviewerId: string) {
    return this.prisma.userReview.findUnique({
      where: { targetId_reviewerId: { targetId, reviewerId } },
      select: { rating: true },
    });
  }

  upsertUserRating(targetId: string, reviewerId: string, rating: number) {
    return this.prisma.userReview.upsert({
      where: { targetId_reviewerId: { targetId, reviewerId } },
      update: { rating },
      create: { targetId, reviewerId, rating },
    });
  }

  aggregateUserRating(targetId: string) {
    return this.prisma.userReview.aggregate({
      where: { targetId },
      _avg: { rating: true },
      _count: { rating: true },
    });
  }

  updateUserRatingCache(targetId: string, rating: number, reviewCount: number) {
    return this.prisma.user.update({
      where: { id: targetId },
      data: { rating, reviewCount },
      select: { id: true },
    });
  }

  findBlock(blockerId: string, blockedId: string) {
    return this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      select: { id: true },
    });
  }

  createBlock(blockerId: string, blockedId: string) {
    return this.prisma.userBlock.create({
      data: { blockerId, blockedId },
    });
  }

  deleteBlock(blockerId: string, blockedId: string) {
    return this.prisma.userBlock.delete({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
  }

  deleteFollowIfExists(followerId: string, followingId: string) {
    return this.prisma.follow.deleteMany({
      where: { followerId, followingId },
    });
  }

  findBlockedUsers(blockerId: string) {
    return this.prisma.userBlock.findMany({
      where: { blockerId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        blocked: { select: connectionUserSelect },
      },
    });
  }

  async findBlockedRelationshipIds(userId: string): Promise<string[]> {
    const [initiated, received] = await Promise.all([
      this.prisma.userBlock.findMany({
        where: { blockerId: userId },
        select: { blockedId: true },
        take: 2000,
      }),
      this.prisma.userBlock.findMany({
        where: { blockedId: userId },
        select: { blockerId: true },
        take: 2000,
      }),
    ]);
    const ids = new Set<string>();
    for (const row of initiated) ids.add(row.blockedId);
    for (const row of received) ids.add(row.blockerId);
    return [...ids];
  }

  findPrivacySettings(userId: string) {
    return this.prisma.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      select: {
        showInSearch: true,
        allowPrivateMessages: true,
        showFollowingList: true,
        commentsAudience: true,
        privateMessagesAudience: true,
        notificationsEnabled: true,
      },
    });
  }

  findAccountSettings(userId: string) {
    return this.prisma.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      select: {
        phone: true,
        email: true,
        birthDate: true,
      },
    });
  }

  updatePrivacySettings(
    userId: string,
    data: {
      showInSearch?: boolean;
      allowPrivateMessages?: boolean;
      showFollowingList?: boolean;
      commentsAudience?: string;
      privateMessagesAudience?: string;
      notificationsEnabled?: boolean;
    },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        showInSearch: true,
        allowPrivateMessages: true,
        showFollowingList: true,
        commentsAudience: true,
        privateMessagesAudience: true,
        notificationsEnabled: true,
      },
    });
  }

  updateAccountSettings(
    userId: string,
    data: {
      email?: string | null;
      birthDate?: Date | null;
      phone?: string;
    },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        phone: true,
        email: true,
        birthDate: true,
      },
    });
  }

  findUserByPhone(phone: string, excludeUserId?: string) {
    return this.prisma.user.findFirst({
      where: {
        phone,
        isActive: true,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
  }

  findUserByEmail(email: string, excludeUserId?: string) {
    return this.prisma.user.findFirst({
      where: {
        email,
        isActive: true,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
  }

  findUserCommentsAudience(userId: string) {
    return this.prisma.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      select: { commentsAudience: true },
    });
  }

  findUserPrivacyFlags(userId: string) {
    return this.prisma.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      select: {
        allowPrivateMessages: true,
        showFollowingList: true,
        privateMessagesAudience: true,
      },
    });
  }
}
