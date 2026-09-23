import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SocketRepository {
  constructor(private readonly prisma: PrismaService) {}

  updateUserLastSeen(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    });
  }

  findUserActive(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });
  }

  isThreadParticipant(threadId: string, userId: string) {
    return this.prisma.messageThread.findFirst({
      where: {
        id: threadId,
        OR: [{ participant1: userId }, { participant2: userId }],
      },
      select: { id: true },
    });
  }

  findThreadParticipants(threadId: string) {
    return this.prisma.messageThread.findUnique({
      where: { id: threadId },
      select: {
        participant1: true,
        participant2: true,
        type: true,
        butcherId: true,
      },
    });
  }

  createMessageWithThreadUpdate(data: {
    threadId: string;
    senderId: string;
    receiverId: string;
    text?: string;
    imageUrl?: string;
    videoUrl?: string;
    orderId?: string;
  }) {
    return this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          threadId: data.threadId,
          senderId: data.senderId,
          receiverId: data.receiverId,
          text: data.text,
          imageUrl: data.imageUrl,
          videoUrl: data.videoUrl,
          orderId: data.orderId,
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              arabicName: true,
              avatar: true,
            },
          },
        },
      }),
      this.prisma.messageThread.update({
        where: { id: data.threadId },
        data: { lastMessageAt: new Date() },
      }),
    ]);
  }

  markMessagesRead(messageIds: string[], receiverId: string, threadId: string) {
    return this.prisma.message.updateMany({
      where: {
        id: { in: messageIds },
        receiverId,
        threadId,
      },
      data: { isRead: true, readAt: new Date() },
    });
  }

  findLiveStream(streamId: string) {
    return this.prisma.liveStream.findFirst({
      where: { id: streamId, isLive: true },
      select: {
        id: true,
        hostId: true,
        viewers: true,
        likes: true,
        _count: { select: { comments: true } },
      },
    });
  }

  incrementStreamViewers(streamId: string) {
    return this.prisma.liveStream.update({
      where: { id: streamId },
      data: { viewers: { increment: 1 } },
      select: { viewers: true, peakViewers: true },
    });
  }

  updatePeakViewers(streamId: string, peakViewers: number) {
    return this.prisma.liveStream.update({
      where: { id: streamId },
      data: { peakViewers },
    });
  }

  decrementStreamViewers(streamId: string) {
    return this.prisma.liveStream.update({
      where: { id: streamId },
      data: { viewers: { decrement: 1 } },
      select: { viewers: true },
    });
  }

  resetStreamViewers(streamId: string) {
    return this.prisma.liveStream.update({
      where: { id: streamId },
      data: { viewers: 0 },
    });
  }

  findLiveStreamForComment(streamId: string) {
    return this.prisma.liveStream.findFirst({
      where: { id: streamId, isLive: true },
      select: { id: true },
    });
  }

  findUserProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { arabicName: true, displayName: true, avatar: true },
    });
  }

  createLiveComment(data: {
    streamId: string;
    userId: string;
    username: string;
    arabicName: string;
    avatar?: string | null;
    message: string;
    isOffer: boolean;
    offerAmount?: number;
  }) {
    return this.prisma.liveComment.create({ data });
  }

  incrementStreamLikes(streamId: string) {
    return this.prisma.liveStream.update({
      where: { id: streamId },
      data: { likes: { increment: 1 } },
      select: { likes: true },
    });
  }

  findButcherOrder(orderId: string) {
    return this.prisma.butcherOrder.findUnique({
      where: { id: orderId },
      select: {
        customerId: true,
        status: true,
        butcher: { select: { userId: true, id: true } },
      },
    });
  }

  markNotificationsRead(ids: string[], userId: string) {
    return this.prisma.notification.updateMany({
      where: { id: { in: ids }, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }
}
