import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, IsUUID } from 'class-validator';
import { Socket } from 'socket.io';
import { AuthService } from '../../auth/services/auth.service';
import { JwtTokenService } from '../../auth/services/jwt-token.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { LoggerService } from '../../common/services/logger.service';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { RedisSessionService } from '../../redis/services/redis-session.service';
import { AppNotificationsService } from '../../queue/services/app-notifications.service';
import {
  ChatReadDto,
  ChatSendDto,
  ChatTypingDto,
  LiveCommentDto,
  OrderStatusDto,
  SupportSendDto,
} from '../dto/socket-events.dto';
import { SocketRepository } from '../repositories/socket.repository';
import { SocketEmitService } from './socket-emit.service';
import { MessagingPolicyService } from '../../messages/services/messaging-policy.service';
import { SupportTicketsService } from '../../support/services/support-tickets.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { markSocketOffline, markSocketOnline } from './online-presence';

class UuidParamDto {
  @IsUUID()
  id!: string;
}

export type SocketError = { code: string; message: string };

@Injectable()
export class SocketGatewayService {
  constructor(
    private readonly jwt: JwtTokenService,
    private readonly auth: AuthService,
    private readonly sessions: RedisSessionService,
    private readonly cache: RedisCacheService,
    private readonly repo: SocketRepository,
    private readonly notifications: AppNotificationsService,
    private readonly emitService: SocketEmitService,
    private readonly logger: LoggerService,
    private readonly messagingPolicy: MessagingPolicyService,
    private readonly supportTickets: SupportTicketsService,
  ) {}

  private policyError(err: unknown): SocketError {
    if (err instanceof ApiException) {
      return { code: err.error, message: err.messageAr };
    }
    return { code: 'server_error', message: 'Failed to authorize message' };
  }

  async authenticate(client: Socket): Promise<JwtPayload> {
    const authToken = client.handshake.auth?.token;
    const headerAuth = client.handshake.headers?.authorization;
    const token =
      (typeof authToken === 'string' ? authToken : undefined) ||
      (typeof headerAuth === 'string'
        ? headerAuth.replace('Bearer ', '')
        : undefined);

    if (!token) throw new Error('Authentication required');

    const payload = this.jwt.verifyAccessToken(token);

    const blacklisted = await this.sessions.get<boolean>(`blacklist:${token}`);
    if (blacklisted) throw new Error('Token revoked');

    if (!(await this.auth.isPasswordVersionValid(payload))) {
      throw new Error('Token revoked');
    }

    const user = await this.repo.findUserActive(payload.userId);
    if (!user || !user.isActive) throw new Error('Account disabled');

    return payload;
  }

  async onUserConnected(userId: string, socketId: string): Promise<void> {
    await markSocketOnline(this.cache, userId, socketId);
  }

  onUserDisconnected(userId: string, socketId?: string): void {
    const cleanup = async () => {
      if (socketId) {
        const result = await markSocketOffline(this.cache, userId, socketId);
        if (result.stillOnline) return;
      } else {
        await this.cache.del(`online:${userId}`, `online:sockets:${userId}`);
      }
      await this.repo.updateUserLastSeen(userId);
    };

    Promise.race([
      cleanup(),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('cleanup timeout')), 5000),
      ),
    ]).catch((err) =>
      this.logger.warn(
        {
          err: err instanceof Error ? err.message : String(err),
          userId,
        },
        'Disconnect cleanup failed',
      ),
    );
  }

  parseUuid(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const dto = plainToInstance(UuidParamDto, { id: value });
    const errors = validateSync(dto);
    return errors.length ? null : dto.id;
  }

  validateDto<T extends object>(
    DtoClass: new () => T,
    payload: unknown,
  ): T | null {
    if (
      payload === null ||
      payload === undefined ||
      typeof payload !== 'object'
    )
      return null;
    const instance = plainToInstance(DtoClass, payload);
    const errors = validateSync(instance, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });
    return errors.length ? null : instance;
  }

  async assertThreadParticipant(
    threadId: string,
    userId: string,
  ): Promise<boolean> {
    const thread = await this.repo.isThreadParticipant(threadId, userId);
    return !!thread;
  }

  async handleChatJoin(
    threadId: string,
    userId: string,
  ): Promise<SocketError | null> {
    const allowed = await this.assertThreadParticipant(threadId, userId);
    if (!allowed) {
      return {
        code: 'unauthorized',
        message: 'Not a participant in this thread',
      };
    }
    return null;
  }

  async handleChatSend(
    user: JwtPayload,
    data: ChatSendDto,
  ): Promise<SocketError | null> {
    const allowed = await this.assertThreadParticipant(
      data.threadId,
      user.userId,
    );
    if (!allowed) {
      return {
        code: 'unauthorized',
        message: 'Not a participant in this thread',
      };
    }

    const thread = await this.repo.findThreadParticipants(data.threadId);
    if (!thread) return { code: 'not_found', message: 'Thread not found' };

    const expectedReceiver =
      thread.participant1 === user.userId
        ? thread.participant2
        : thread.participant1;
    if (data.receiverId !== expectedReceiver) {
      return {
        code: 'unauthorized',
        message: 'Invalid receiverId for this thread',
      };
    }

    try {
      await this.messagingPolicy.assertCanSendMessage({
        senderId: user.userId,
        receiverId: data.receiverId,
        type: thread.type,
        butcherId: thread.butcherId,
      });
    } catch (err) {
      return this.policyError(err);
    }

    try {
      const [message] = await this.repo.createMessageWithThreadUpdate({
        threadId: data.threadId,
        senderId: user.userId,
        receiverId: data.receiverId,
        text: data.text,
        imageUrl: data.imageUrl,
        videoUrl: data.videoUrl,
        orderId: data.orderId,
      });

      const preview = data.text?.slice(0, 60)
        ? data.text.slice(0, 60)
        : data.videoUrl
          ? '🎬 فيديو'
          : '📷 صورة';

      this.emitService.emitToThread(data.threadId, 'chat:message', message);
      this.emitService.emitToUser(data.receiverId, 'chat:notification', {
        threadId: data.threadId,
        senderId: user.userId,
        senderName: message.sender.arabicName,
        preview,
      });

      void this.notifications.notifyUser({
        userId: data.receiverId,
        type: 'new_message',
        titleAr:
          message.sender.arabicName || message.sender.username || 'مستخدم',
        bodyAr: data.text?.trim()
          ? data.text.trim()
          : data.videoUrl
            ? 'أرسل فيديو'
            : 'أرسل صورة',
        data: {
          threadId: data.threadId,
          messageId: message.id,
          senderId: user.userId,
          actorId: user.userId,
          actorAvatar: message.sender.avatar ?? undefined,
          ...(data.orderId ? { orderId: data.orderId } : {}),
          ...(data.imageUrl ? { imageUrl: data.imageUrl } : {}),
          ...(data.videoUrl ? { videoUrl: data.videoUrl } : {}),
        },
      });
    } catch (err) {
      this.logger.error({ err }, 'chat:send error');
      return { code: 'server_error', message: 'Failed to send message' };
    }

    return null;
  }

  async handleChatTyping(
    user: JwtPayload,
    data: ChatTypingDto,
  ): Promise<SocketError | null> {
    const allowed = await this.assertThreadParticipant(
      data.threadId,
      user.userId,
    );
    if (!allowed) {
      return {
        code: 'unauthorized',
        message: 'Not a participant in this thread',
      };
    }

    const thread = await this.repo.findThreadParticipants(data.threadId);
    if (!thread) return { code: 'not_found', message: 'Thread not found' };

    const expectedReceiver =
      thread.participant1 === user.userId
        ? thread.participant2
        : thread.participant1;
    if (data.receiverId !== expectedReceiver) {
      return {
        code: 'unauthorized',
        message: 'Invalid receiverId for this thread',
      };
    }

    try {
      await this.messagingPolicy.assertNotBlocked(user.userId, data.receiverId);
    } catch (err) {
      return this.policyError(err);
    }

    const server = this.emitService.getServer();
    server
      ?.to(`user:${data.receiverId}`)
      .emit('chat:typing', { threadId: data.threadId, userId: user.userId });
    return null;
  }

  async handleChatRead(user: JwtPayload, data: ChatReadDto): Promise<void> {
    await this.repo
      .markMessagesRead(data.messageIds, user.userId, data.threadId)
      .catch(() => {});

    const server = this.emitService.getServer();
    server
      ?.to(`thread:${data.threadId}`)
      .emit('chat:read', { threadId: data.threadId, readBy: user.userId });
  }

  async handleLiveJoin(
    streamId: string,
    user: JwtPayload,
    clientEmit: (event: string, data: unknown) => void,
  ): Promise<
    | SocketError
    | { stats: { viewers: number; likes: number; commentsCount: number } }
  > {
    const stream = await this.repo.findLiveStream(streamId);
    if (!stream) {
      return {
        code: 'not_found',
        message: 'Stream not found or not live',
      };
    }

    let viewers = stream.viewers;

    if (user.userId !== stream.hostId) {
      const updated = await this.repo.incrementStreamViewers(streamId);
      viewers = updated.viewers;

      if (updated.viewers > updated.peakViewers) {
        await this.repo
          .updatePeakViewers(streamId, updated.viewers)
          .catch(() => {});
      }

      this.emitService.emitToStream(streamId, 'live:viewers', viewers);
    }

    const stats = {
      viewers,
      likes: stream.likes,
      commentsCount: stream._count.comments,
    };
    clientEmit('live:stats', stats);
    this.emitService.emitToStream(streamId, 'live:stats', stats);

    return { stats };
  }

  async handleLiveLeave(streamId: string): Promise<void> {
    const updated = await this.repo
      .decrementStreamViewers(streamId)
      .catch(() => ({ viewers: 0 }));

    const viewers = Math.max(0, updated.viewers);
    this.emitService.emitToStream(streamId, 'live:viewers', viewers);

    if (updated.viewers < 0) {
      await this.repo.resetStreamViewers(streamId).catch(() => {});
    }
  }

  async handleLiveComment(
    user: JwtPayload,
    data: LiveCommentDto,
  ): Promise<SocketError | null> {
    const stream = await this.repo.findLiveStreamForComment(data.streamId);
    if (!stream) {
      return { code: 'stream_ended', message: 'Stream is not live' };
    }

    const profile = await this.repo.findUserProfile(user.userId);

    const comment = await this.repo.createLiveComment({
      streamId: data.streamId,
      userId: user.userId,
      username: user.username,
      arabicName: profile?.arabicName ?? profile?.displayName ?? user.username,
      avatar: profile?.avatar,
      message: data.message.trim(),
      isOffer: data.isOffer || false,
      offerAmount: data.offerAmount,
    });

    this.emitService.emitToStream(data.streamId, 'live:comment', comment);
    return null;
  }

  async handleLiveLike(streamId: string, user: JwtPayload): Promise<void> {
    const updated = await this.repo
      .incrementStreamLikes(streamId)
      .catch(() => null);

    if (!updated) return;

    this.emitService.emitToStream(streamId, 'live:like', {
      userId: user.userId,
      likes: updated.likes,
    });
    this.emitService.emitToStream(streamId, 'live:likes', updated.likes);
  }

  async handleOrderStatus(
    _user: JwtPayload,
    _data: OrderStatusDto,
  ): Promise<SocketError | null> {
    return { code: 'gone', message: 'Butcher orders are no longer available' };
  }

  onPresencePing(userId: string, socketId: string): void {
    void markSocketOnline(this.cache, userId, socketId).catch(() => {});
  }

  async handleNotificationsRead(userId: string, raw: unknown): Promise<void> {
    if (!Array.isArray(raw)) return;
    const ids = raw
      .filter((id): id is string => typeof id === 'string')
      .slice(0, 50);
    if (ids.length === 0) return;

    await this.repo.markNotificationsRead(ids, userId).catch(() => {});
  }

  async handleSupportJoin(
    user: JwtPayload,
    ticketId: string,
  ): Promise<SocketError | null> {
    const ticket = await this.supportTickets.getTicketForSocket(user, ticketId);
    if (!ticket) {
      return {
        code: 'unauthorized',
        message: 'Not allowed to join this ticket',
      };
    }
    return null;
  }

  async handleSupportSend(
    user: JwtPayload,
    data: SupportSendDto,
  ): Promise<SocketError | null> {
    const ticket = await this.supportTickets.getTicketForSocket(
      user,
      data.ticketId,
    );
    if (!ticket) {
      return {
        code: 'unauthorized',
        message: 'Not allowed to send on this ticket',
      };
    }
    try {
      if (this.supportTickets.isStaffRole(user.role)) {
        await this.supportTickets.replyAsStaff(user, data.ticketId, {
          body: data.body,
        });
      } else {
        await this.supportTickets.replyAsUser(user, data.ticketId, {
          body: data.body,
        });
      }
    } catch (err) {
      return this.policyError(err);
    }
    return null;
  }
}
