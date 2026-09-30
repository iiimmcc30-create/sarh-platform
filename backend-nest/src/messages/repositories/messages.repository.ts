import { Injectable } from '@nestjs/common';
import { MessageContentType, MessageThreadType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const PARTICIPANT_SELECT = {
  id: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  username: true,
  verified: true,
} as const;

const SENDER_SELECT = {
  id: true,
  displayName: true,
  arabicName: true,
  avatar: true,
} as const;

/** Every thread is a direct conversation. */
export const DIRECT_SCOPE_KEY = 'direct';

@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findThreadsForUser(userId: string, type?: MessageThreadType) {
    return this.prisma.messageThread.findMany({
      where: {
        OR: [{ participant1: userId }, { participant2: userId }],
        ...(type ? { type } : {}),
        states: {
          none: { userId, hiddenAt: { not: null } },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 50,
      include: {
        states: {
          where: { userId },
          select: { pinnedAt: true, hiddenAt: true, mutedAt: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            text: true,
            imageUrl: true,
            videoUrl: true,
            audioUrl: true,
            type: true,
            isRead: true,
            createdAt: true,
            senderId: true,
          },
        },
      },
    });
  }

  findParticipants(ids: string[]) {
    return this.prisma.user.findMany({
      take: Math.max(ids.length, 1),
      where: { id: { in: ids } },
      select: PARTICIPANT_SELECT,
    });
  }

  countUnreadByThread(userId: string, threadIds: string[]) {
    return this.prisma.message.groupBy({
      by: ['threadId'],
      where: {
        receiverId: userId,
        isRead: false,
        threadId: { in: threadIds },
      },
      _count: { id: true },
    });
  }

  findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        allowPrivateMessages: true,
        privateMessagesAudience: true,
      },
    });
  }

  findFollow(followerId: string, followingId: string) {
    return this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
      select: { id: true },
    });
  }

  findBlock(blockerId: string, blockedId: string) {
    return this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      select: { id: true },
    });
  }

  upsertThread(params: {
    participant1: string;
    participant2: string;
    type: MessageThreadType;
  }) {
    const scopeKey = DIRECT_SCOPE_KEY;
    return this.prisma.messageThread.upsert({
      where: {
        participant1_participant2_scopeKey: {
          participant1: params.participant1,
          participant2: params.participant2,
          scopeKey,
        },
      },
      update: { lastMessageAt: new Date() },
      create: {
        participant1: params.participant1,
        participant2: params.participant2,
        type: params.type,
        scopeKey,
      },
    });
  }

  /** Bump an existing thread (used when sending into a resolved thread). */
  touchThread(id: string) {
    return this.prisma.messageThread.update({
      where: { id },
      data: { lastMessageAt: new Date() },
    });
  }

  createMessage(data: {
    threadId: string;
    senderId: string;
    receiverId: string;
    text?: string;
    imageUrl?: string;
    videoUrl?: string;
    type?: MessageContentType;
    audioUrl?: string;
    mediaDurationMs?: number;
    mediaMimeType?: string;
    mediaSizeBytes?: number;
  }) {
    return this.prisma.message.create({
      data,
      include: { sender: { select: SENDER_SELECT } },
    });
  }

  findThreadForUser(threadId: string, userId: string) {
    return this.prisma.messageThread.findFirst({
      where: {
        id: threadId,
        OR: [{ participant1: userId }, { participant2: userId }],
      },
      select: {
        id: true,
        participant1: true,
        participant2: true,
        type: true,
      },
    });
  }

  findMessages(threadId: string, take: number, cursor?: string) {
    return this.prisma.message.findMany({
      where: { threadId },
      take,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
      include: { sender: { select: SENDER_SELECT } },
    });
  }

  markThreadRead(threadId: string, receiverId: string) {
    return this.prisma.message.updateMany({
      where: { threadId, receiverId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  upsertThreadState(
    threadId: string,
    userId: string,
    data: {
      pinnedAt?: Date | null;
      hiddenAt?: Date | null;
      mutedAt?: Date | null;
    },
  ) {
    return this.prisma.messageThreadState.upsert({
      where: { threadId_userId: { threadId, userId } },
      create: {
        threadId,
        userId,
        pinnedAt: data.pinnedAt ?? null,
        hiddenAt: data.hiddenAt ?? null,
        mutedAt: data.mutedAt ?? null,
      },
      update: data,
      select: { pinnedAt: true, hiddenAt: true, mutedAt: true },
    });
  }

  /** The user's own state row for a thread (pin / hide / mute), if any. */
  findThreadState(threadId: string, userId: string) {
    return this.prisma.messageThreadState.findUnique({
      where: { threadId_userId: { threadId, userId } },
      select: { mutedAt: true },
    });
  }

  clearHiddenForThread(threadId: string) {
    return this.prisma.messageThreadState.updateMany({
      where: { threadId, hiddenAt: { not: null } },
      data: { hiddenAt: null },
    });
  }

  /**
   * Every conversation between a pair (newest first). Normally exactly one
   * (scopeKey 'direct'); legacy scoped rows are kept readable, never merged.
   */
  findThreadsForPair(userA: string, userB: string) {
    const [participant1, participant2] = [userA, userB].sort();
    return this.prisma.messageThread.findMany({
      where: { participant1, participant2 },
      orderBy: { lastMessageAt: 'desc' },
      take: 10,
      select: {
        id: true,
        type: true,
        scopeKey: true,
        lastMessageAt: true,
      },
    });
  }

  findFollowingUsers(userId: string, take: number) {
    return this.prisma.follow.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: 'desc' },
      take,
      select: { following: { select: PARTICIPANT_SELECT } },
    });
  }

  findFollowerUsers(userId: string, take: number) {
    return this.prisma.follow.findMany({
      where: { followingId: userId },
      orderBy: { createdAt: 'desc' },
      take,
      select: { follower: { select: PARTICIPANT_SELECT } },
    });
  }

  findRecentPartnerThreads(userId: string, take: number) {
    return this.prisma.messageThread.findMany({
      where: { OR: [{ participant1: userId }, { participant2: userId }] },
      orderBy: { lastMessageAt: 'desc' },
      take,
      select: { participant1: true, participant2: true },
    });
  }

  findBlockRelations(userId: string) {
    return this.prisma.userBlock.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      take: 500,
      select: { blockerId: true, blockedId: true },
    });
  }

  searchActiveUsers(q: string, excludeUserId: string, take: number) {
    return this.prisma.user.findMany({
      where: {
        id: { not: excludeUserId },
        isActive: true,
        deletedAt: null,
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
          { arabicName: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ verified: 'desc' }, { username: 'asc' }],
      take,
      select: PARTICIPANT_SELECT,
    });
  }

  findActiveParticipant(id: string) {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: PARTICIPANT_SELECT,
    });
  }
}
