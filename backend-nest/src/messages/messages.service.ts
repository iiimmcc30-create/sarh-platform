import { Injectable } from '@nestjs/common';
import { MessageThreadType } from '@prisma/client';
import { throwApi } from '../common/exceptions/api.exception';
import { LoggerService } from '../common/services/logger.service';
import { AppNotificationsService } from '../queue/services/app-notifications.service';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  ContactsQueryDto,
  ListThreadsQueryDto,
  SendMessageDto,
  ThreadMessagesQueryDto,
} from './dto/messages.dto';
import {
  inboxPreview,
  isMessagePayloadError,
  notificationPreview,
  pushBody,
  resolveMessagePayload,
} from './lib/message-payload';
import {
  DIRECT_SCOPE_KEY,
  MessagesRepository,
} from './repositories/messages.repository';
import { MessagingPolicyService } from './services/messaging-policy.service';
import { MessageMediaService } from './services/message-media.service';
import { publicMediaForPush } from './lib/message-media';
import { SocketEmitService } from '../gateway/services/socket-emit.service';

const PAGE_SIZE = 40;
const CONTACTS_LIMIT = 60;
const CONTACTS_SOURCE_TAKE = 200;

export type ContactSource = 'recent' | 'following' | 'follower' | 'search';

@Injectable()
export class MessagesService {
  constructor(
    private readonly repo: MessagesRepository,
    private readonly logger: LoggerService,
    private readonly notifications: AppNotificationsService,
    private readonly policy: MessagingPolicyService,
    private readonly sockets: SocketEmitService,
    private readonly media: MessageMediaService,
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
        participant: other ?? null,
        lastMessage: inboxPreview(lastMsg),
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
    const { receiverId } = dto;
    const senderId = user.userId;

    const resolved = resolveMessagePayload({
      text: dto.text,
      imageUrl: dto.imageUrl,
      videoUrl: dto.videoUrl,
      audioUrl: dto.audioUrl,
      durationMs: dto.durationMs,
      messageType: dto.messageType,
      mediaMimeType: dto.mediaMimeType,
      mediaSizeBytes: dto.mediaSizeBytes,
    });
    if (isMessagePayloadError(resolved)) {
      throwApi(400, resolved.code, resolved.message);
    }

    const type: MessageThreadType = dto.type ?? 'DIRECT';

    await this.policy.assertCanSendMessage({ senderId, receiverId });

    // Real stored size / ownership of the upload is checked before accepting.
    const payload = await this.media.verifyForSend(senderId, resolved);

    // Conversations are general 1:1 threads resolved by the sorted pair.
    const [p1, p2] = [senderId, receiverId].sort();
    const thread = await this.repo.upsertThread({
      participant1: p1,
      participant2: p2,
      type,
    });

    const created = await this.repo.createMessage({
      threadId: thread.id,
      senderId,
      receiverId,
      ...payload,
    });
    const message = this.media.presentMessage(created);

    await this.repo.clearHiddenForThread(thread.id);

    const senderName =
      message.sender.arabicName ||
      message.sender.displayName ||
      user.username ||
      'مستخدم';
    this.sockets.emitToThread(thread.id, 'chat:message', message);
    this.sockets.emitToUser(receiverId, 'chat:notification', {
      threadId: thread.id,
      senderId,
      senderName,
      preview: notificationPreview(payload),
    });

    void this.notifications.notifyUser({
      userId: receiverId,
      type: 'new_message',
      titleAr: senderName,
      bodyAr: pushBody(payload),
      data: {
        threadId: thread.id,
        messageId: message.id,
        senderId,
        actorId: senderId,
        actorAvatar: message.sender.avatar,
        threadType: type,
        messageType: payload.type,
        ...publicMediaForPush(payload),
      },
    });

    this.logger.info(
      {
        messageId: message.id,
        senderId,
        receiverId,
        type,
        messageType: payload.type,
      },
      'Message sent',
    );
    return { message, threadId: thread.id, type };
  }

  /**
   * Resolve the 1:1 conversation with a peer without creating anything.
   * Returns the pair's thread (the 'direct' one, else the most recent legacy
   * one) or null when they never talked; the thread is created on first send.
   */
  async getPeerConversation(user: JwtPayload, peerId: string) {
    if (peerId === user.userId) {
      throwApi(400, 'invalid_action', 'لا يمكنك مراسلة نفسك');
    }
    const participant = await this.repo.findActiveParticipant(peerId);
    if (!participant) throwApi(404, 'not_found', 'المستخدم غير موجود');

    const threads = await this.repo.findThreadsForPair(user.userId, peerId);
    const chosen =
      threads.find((t) => t.scopeKey === DIRECT_SCOPE_KEY) ??
      threads[0] ??
      null;
    return {
      threadId: chosen?.id ?? null,
      type: chosen?.type ?? 'DIRECT',
      participant,
    };
  }

  /**
   * People the user can start a chat with: recent chat partners, people they
   * follow and their followers (existing Follow relation), plus optional name
   * search. Blocked users (either direction) are excluded.
   */
  async getContacts(user: JwtPayload, query: ContactsQueryDto = {}) {
    const { userId } = user;
    const q = query.q?.trim() ?? '';

    const [blocks, recentThreads, following, followers, searched] =
      await Promise.all([
        this.repo.findBlockRelations(userId),
        this.repo.findRecentPartnerThreads(userId, CONTACTS_SOURCE_TAKE),
        this.repo.findFollowingUsers(userId, CONTACTS_SOURCE_TAKE),
        this.repo.findFollowerUsers(userId, CONTACTS_SOURCE_TAKE),
        q.length >= 2
          ? this.repo.searchActiveUsers(q, userId, 20)
          : Promise.resolve([]),
      ]);

    const blocked = new Set<string>();
    for (const b of blocks) {
      blocked.add(b.blockerId === userId ? b.blockedId : b.blockerId);
    }

    const recentIds = recentThreads.map((t) =>
      t.participant1 === userId ? t.participant2 : t.participant1,
    );
    const recentUsers = recentIds.length
      ? await this.repo.findParticipants([...new Set(recentIds)])
      : [];
    const recentMap = new Map(recentUsers.map((u) => [u.id, u]));

    type Participant = (typeof recentUsers)[number];
    const out = new Map<string, Participant & { source: ContactSource }>();
    const push = (u: Participant | null | undefined, source: ContactSource) => {
      if (!u || u.id === userId || blocked.has(u.id) || out.has(u.id)) return;
      out.set(u.id, { ...u, source });
    };
    for (const id of recentIds) push(recentMap.get(id), 'recent');
    for (const f of following) push(f.following, 'following');
    for (const f of followers) push(f.follower, 'follower');

    let items = [...out.values()];
    if (q) {
      const needle = q.toLowerCase();
      items = items.filter((u) =>
        [u.displayName, u.arabicName, u.username]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle)),
      );
      const known = new Set(items.map((u) => u.id));
      for (const u of searched) {
        if (u.id === userId || blocked.has(u.id) || known.has(u.id)) continue;
        items.push({ ...u, source: 'search' });
        known.add(u.id);
      }
    }
    return items.slice(0, CONTACTS_LIMIT);
  }

  async getThreadMessages(
    user: JwtPayload,
    threadId: string,
    query: ThreadMessagesQueryDto,
  ) {
    const { userId } = user;
    const { cursor } = query;

    const thread = await this.requireThreadForUser(userId, threadId);

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
      messages: this.media.presentMessages(items.reverse()),
      nextCursor,
      hasMore,
      type: thread.type,
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
