import { Injectable } from '@nestjs/common';
import { MessageThreadType } from '@prisma/client';
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

export function messageScopeKey(
  type: MessageThreadType,
  butcherId?: string | null,
): string {
  if (type === 'BUTCHER' && butcherId) return `butcher:${butcherId}`;
  return 'direct';
}

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
        butcher: {
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            logo: true,
          },
        },
        states: {
          where: { userId },
          select: { pinnedAt: true, hiddenAt: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            text: true,
            imageUrl: true,
            videoUrl: true,
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

  findButcherById(id: string) {
    return this.prisma.butcher.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true, nameAr: true },
    });
  }

  findButcherByUserId(userId: string) {
    return this.prisma.butcher.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true, userId: true },
    });
  }

  /** Latest accepted+ order linking a customer to a butcher (enables shop chat). */
  findAcceptedButcherOrderForChat(customerId: string, butcherId: string) {
    return this.prisma.butcherOrder.findFirst({
      where: {
        customerId,
        butcherId,
        status: { in: ['confirmed', 'preparing', 'ready', 'delivered'] },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, status: true },
    });
  }

  upsertThread(params: {
    participant1: string;
    participant2: string;
    type: MessageThreadType;
    butcherId?: string | null;
  }) {
    const scopeKey = messageScopeKey(params.type, params.butcherId);
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
        butcherId: params.butcherId ?? null,
        scopeKey,
      },
    });
  }

  createMessage(data: {
    threadId: string;
    senderId: string;
    receiverId: string;
    text?: string;
    imageUrl?: string;
    videoUrl?: string;
    orderId?: string;
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
        butcherId: true,
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
    data: { pinnedAt?: Date | null; hiddenAt?: Date | null },
  ) {
    return this.prisma.messageThreadState.upsert({
      where: { threadId_userId: { threadId, userId } },
      create: {
        threadId,
        userId,
        pinnedAt: data.pinnedAt ?? null,
        hiddenAt: data.hiddenAt ?? null,
      },
      update: data,
      select: { pinnedAt: true, hiddenAt: true },
    });
  }

  clearHiddenForThread(threadId: string) {
    return this.prisma.messageThreadState.updateMany({
      where: { threadId, hiddenAt: { not: null } },
      data: { hiddenAt: null },
    });
  }
}
