import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserForLogin(login: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [{ email: login }, { username: login }, { phone: login }],
        isActive: true,
      },
      include: { subscription: true },
    });
  }

  countUserSessions(userId: string) {
    return this.prisma.userSession.count({ where: { userId } });
  }

  findOldestSession(userId: string) {
    return this.prisma.userSession.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
  }

  deleteSession(id: string) {
    return this.prisma.userSession.delete({ where: { id } });
  }

  createSession(data: {
    userId: string;
    refreshToken: string;
    expiresAt: Date;
    ipAddress?: string;
    deviceInfo?: string;
  }) {
    return this.prisma.userSession.create({ data });
  }

  updateLastSeen(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    });
  }

  loginTransaction(
    userId: string,
    session: {
      refreshToken: string;
      expiresAt: Date;
      ipAddress?: string;
      deviceInfo?: string;
    },
  ) {
    return this.prisma.$transaction([
      this.prisma.userSession.create({
        data: { userId, ...session },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { lastSeenAt: new Date() },
      }),
    ]);
  }

  findSessionByRefreshToken(refreshToken: string) {
    return this.prisma.userSession.findUnique({
      where: { refreshToken },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            role: true,
            isActive: true,
            passwordVersion: true,
          },
        },
      },
    });
  }

  deleteAllSessions(userId: string) {
    return this.prisma.userSession.deleteMany({ where: { userId } });
  }

  deleteSessionsByRefreshToken(userId: string, refreshToken: string) {
    return this.prisma.userSession.deleteMany({
      where: { userId, refreshToken },
    });
  }

  rotateSession(sessionId: string, refreshToken: string, expiresAt: Date) {
    return this.prisma.userSession.update({
      where: { id: sessionId },
      data: { refreshToken, expiresAt },
    });
  }

  findExistingUser(conditions: Prisma.UserWhereInput[]) {
    return this.prisma.user.findFirst({
      where: { OR: conditions },
      select: { phone: true, username: true, email: true, googleId: true },
    });
  }

  createUser(data: {
    username: string;
    displayName: string;
    arabicName: string;
    country: string;
    phone: string;
    email: string | null;
    googleId: string | null;
    avatar: string | null;
    passwordHash: string;
    verified: boolean;
  }) {
    return this.prisma.user.create({
      data: {
        ...data,
        country: data.country as Prisma.UserCreateInput['country'],
        role: Role.USER,
        isActive: true,
        subscription: {
          create: {
            planId: 'free',
            renewDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          },
        },
      },
      include: { subscription: true },
    });
  }

  /** Auto-follow the official Knowledge Center so new users see and can interact with its posts. */
  async followKnowledgeCenter(userId: string) {
    const knowledge = await this.prisma.user.findFirst({
      where: { username: 'knowledge_center', deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!knowledge || knowledge.id === userId) return;
    await this.prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: knowledge.id,
        },
      },
      create: {
        followerId: userId,
        followingId: knowledge.id,
      },
      update: {},
    });
  }

  findUserByPhone(phone: string) {
    return this.prisma.user.findFirst({
      where: { phone, isActive: true },
      include: { subscription: true },
    });
  }

  /** Any row with this phone (active or not) — used for signup uniqueness. */
  findAnyUserByPhone(phone: string) {
    return this.prisma.user.findFirst({
      where: { phone },
      select: { id: true },
    });
  }

  /** Any row with this username — used for signup uniqueness. */
  findAnyUserByUsername(username: string) {
    return this.prisma.user.findFirst({
      where: { username },
      select: { id: true },
    });
  }

  findGoogleUser(googleId: string, email: string) {
    return this.prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
      include: { subscription: true },
    });
  }

  linkGoogleId(userId: string, googleId: string, avatar: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { googleId, avatar },
      include: { subscription: true },
    });
  }

  findUserPassword(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
  }

  changePasswordTransaction(userId: string, passwordHash: string) {
    return this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, passwordVersion: { increment: 1 } },
      }),
      this.prisma.userSession.deleteMany({ where: { userId } }),
    ]);
  }

  resetPasswordTransaction(userId: string, passwordHash: string) {
    return this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, passwordVersion: { increment: 1 } },
      }),
      this.prisma.userSession.deleteMany({ where: { userId } }),
    ]);
  }

  findUserForEmailVerify(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, arabicName: true, emailVerified: true },
    });
  }

  verifyEmail(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
  }

  getPasswordVersion(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordVersion: true, isActive: true },
    });
  }

  isUserActive(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });
  }
}
