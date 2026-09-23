import { Injectable } from '@nestjs/common';
import { MessageThreadType } from '@prisma/client';
import { throwApi } from '../common/exceptions/api.exception';
import { LoggerService } from '../common/services/logger.service';
import { AppNotificationsService } from '../queue/services/app-notifications.service';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  ListThreadsQueryDto,
  SendMessageDto,
  ThreadMessagesQueryDto,
} from './dto/messages.dto';
import { MessagesRepository } from './repositories/messages.repository';
import { MessagingPolicyService } from './services/messaging-policy.service';
import { SocketEmitService } from '../gateway/services/socket-emit.service';

const PAGE_SIZE = 40;

@Injectable()
export class MessagesService {
  constructor(
    private readonly repo: MessagesRepository,
    private readonly logger: LoggerService,
    private readonly notifications: AppNotificationsService,
    private readonly policy: MessagingPolicyService,
    private readonly sockets: SocketEmitService,
  ) {}

  async getThreads(user: JwtPayload, query: ListThreadsQueryDto = {}) {
    const { userId } = user;
    const threads = await this.repo.findThreadsForUser(userId, query.type);

    const otherIds = threads.map((t) =>
      t.participant1 === userId ? t.participant2 : t.participant1,
    );

    const participants = await this.repo.findParticipants(otherIds);
    const participantMap = new Map(participants.map((p) => [p.id, p]));

    const unreadCounts = await this.repo.countUnreadByThread(
      userId,
      threads.map((t) => t.id),
    );
    const unreadMap = new Map(
      unreadCounts.map((u) => [u.threadId, u._count.id]),
    );

    const mapped = threads.map((t) => {
      const otherId =
        t.participant1 === userId ? t.participant2 : t.participant1;
      const other = participantMap.get(otherId);
      const lastMsg = t.messages[0];
      const state = t.states[0];
      return {
        id: t.id,
        type: t.type,
        butcherId: t.butcherId,
        butcher: t.butcher
          ? {
              id: t.butcher.id,
              nameAr: t.butcher.nameAr,
              nameEn: t.butcher.nameEn,
              logo: t.butcher.logo,
            }
          : null,
        participant: other ?? null,
        lastMessage:
          lastMsg?.text ||
          (lastMsg?.videoUrl ? '[فيديو]' : lastMsg?.imageUrl ? '[صورة]' : null),
        lastMessageAt: t.lastMessageAt,
        unread: unreadMap.get(t.id) ?? 0,
        isMine: lastMsg?.senderId === userId,
        isPinned: Boolean(state?.pinnedAt),
        pinnedAt: state?.pinnedAt ?? null,
      };
    });

    return mapped.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return (
        new Date(b.lastMessageAt).getTime() -
        new Date(a.lastMessageAt).getTime()
      );
    });
  }

  async sendMessage(user: JwtPayload, dto: SendMessageDto) {
    const { receiverId, text, imageUrl, videoUrl, orderId, butcherId } = dto;
    const senderId = user.userId;

    const bodyText = text?.trim() || undefined;
    if (!bodyText && !imageUrl && !videoUrl) {
      throwApi(400, 'empty_message', 'يجب إرسال نص أو صورة أو فيديو');
    }

    let type: MessageThreadType = dto.type ?? 'DIRECT';
    let resolvedButcherId: string | null = null;
    let resolvedOrderId: string | undefined = orderId;

    if (butcherId || type === 'BUTCHER' || orderId) {
      type = 'BUTCHER';
      resolvedButcherId = butcherId ?? null;
    }

    await this.policy.assertCanSendMessage({
      senderId,
      receiverId,
      type,
      butcherId: resolvedButcherId,
    });

    if (type === 'BUTCHER' && resolvedButcherId) {
      const butcher = await this.repo.findButcherById(resolvedButcherId);
      if (butcher && !resolvedOrderId) {
        const customerId =
          butcher.userId === senderId
            ? receiverId
            : butcher.userId === receiverId
              ? senderId
              : null;
        if (customerId) {
          const acceptedOrder = await this.repo.findAcceptedButcherOrderForChat(
            customerId,
            butcher.id,
          );
          resolvedOrderId = acceptedOrder?.id;
        }
      }
    }

    const [p1, p2] = [senderId, receiverId].sort();
    const thread = await this.repo.upsertThread({
      participant1: p1,
      participant2: p2,
      type,
      butcherId: resolvedButcherId,
    });

    const message = await this.repo.createMessage({
      threadId: thread.id,
      senderId,
      receiverId,
      text: bodyText,
      imageUrl,
      videoUrl,
      orderId: resolvedOrderId,
    });

    await this.repo.clearHiddenForThread(thread.id);

    const senderName =
      message.sender.arabicName ||
      message.sender.displayName ||
      user.username ||
      'مستخدم';
    const notifyBody = bodyText
      ? bodyText
      : videoUrl
        ? 'أرسل فيديو'
        : 'أرسل صورة';
    const preview = bodyText?.slice(0, 60)
      ? bodyText.slice(0, 60)
      : videoUrl
        ? '🎬 فيديو'
        : '📷 صورة';
    this.sockets.emitToThread(thread.id, 'chat:message', message);
    this.sockets.emitToUser(receiverId, 'chat:notification', {
      threadId: thread.id,
      senderId,
      senderName,
      preview,
    });

    void this.notifications.notifyUser({
      userId: receiverId,
      type: 'new_message',
      titleAr: senderName,
      bodyAr: notifyBody,
      data: {
        threadId: thread.id,
        messageId: message.id,
        senderId,
        actorId: senderId,
        actorAvatar: message.sender.avatar,
        threadType: type,
        ...(resolvedButcherId ? { butcherId: resolvedButcherId } : {}),
        ...(resolvedOrderId ? { orderId: resolvedOrderId } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(videoUrl ? { videoUrl } : {}),
      },
    });

    this.logger.info(
      { messageId: message.id, senderId, receiverId, type },
      'Message sent',
    );
    return { message, threadId: thread.id, type };
  }

  async getThreadMessages(
    user: JwtPayload,
    threadId: string,
    query: ThreadMessagesQueryDto,
  ) {
    const { userId } = user;
    const { cursor } = query;

    const thread = await this.requireThreadForUser(userId, threadId);

    if (thread.type === 'BUTCHER' && thread.butcherId) {
      const otherId =
        thread.participant1 === userId
          ? thread.participant2
          : thread.participant1;
      const butcher = await this.repo.findButcherById(thread.butcherId);
      if (butcher) {
        const customerId =
          butcher.userId === userId
            ? otherId
            : butcher.userId === otherId
              ? userId
              : null;
        if (customerId) {
          const acceptedOrder = await this.repo.findAcceptedButcherOrderForChat(
            customerId,
            thread.butcherId,
          );
          if (!acceptedOrder) {
            throwApi(
              403,
              'chat_not_allowed',
              'المحادثة متاحة بعد تقديم الطلب وقبوله من الملحمة',
            );
          }
        }
      }
    }

    const messages = await this.repo.findMessages(
      threadId,
      PAGE_SIZE + 1,
      cursor,
    );

    const hasMore = messages.length > PAGE_SIZE;
    const items = hasMore ? messages.slice(0, -1) : messages;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

    await this.repo.markThreadRead(threadId, userId);

    return {
      messages: items.reverse(),
      nextCursor,
      hasMore,
      type: thread.type,
      butcherId: thread.butcherId,
    };
  }

  async hideThread(user: JwtPayload, threadId: string) {
    await this.requireThreadForUser(user.userId, threadId);
    await this.repo.upsertThreadState(threadId, user.userId, {
      hiddenAt: new Date(),
    });
    return { hidden: true };
  }

  async pinThread(user: JwtPayload, threadId: string, pinned: boolean) {
    await this.requireThreadForUser(user.userId, threadId);
    const state = await this.repo.upsertThreadState(threadId, user.userId, {
      pinnedAt: pinned ? new Date() : null,
    });
    return {
      pinned: Boolean(state.pinnedAt),
      pinnedAt: state.pinnedAt,
    };
  }

  private async requireThreadForUser(userId: string, threadId: string) {
    const thread = await this.repo.findThreadForUser(threadId, userId);
    if (!thread) throwApi(404, 'not_found', 'المحادثة غير موجودة');
    return thread;
  }
}
