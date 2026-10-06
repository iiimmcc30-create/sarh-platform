import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { LoggerService } from '../common/services/logger.service';
import {
  ChatReadDto,
  ChatSendDto,
  ChatTypingDto,
  LiveCommentDto,
  SupportJoinDto,
  SupportSendDto,
} from './dto/socket-events.dto';
import { SocketEmitService } from './services/socket-emit.service';
import { SocketGatewayService } from './services/socket-gateway.service';
import { SocketRedisAdapterService } from './services/socket-redis-adapter.service';
import { isAllowedCorsOrigin } from '../lib/cors-origins';
import { CouncilRealtimeService } from '../councils/services/council-realtime.service';

interface AuthenticatedSocket extends Socket {
  data: {
    user?: JwtPayload;
    streamId?: string;
    councils?: Set<string>;
    councilRate?: { windowStart: number; count: number };
  };
}

/** «المجالس»: per-socket budget for council messages (join/leave/heartbeat). */
const COUNCIL_MSG_WINDOW_MS = 10_000;
const COUNCIL_MSG_MAX = 20;

/** «المجالس» socket payloads accept either `councilId` or `{ councilId }`. */
function councilIdOf(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'councilId' in raw) {
    return (raw as { councilId: unknown }).councilId;
  }
  return raw;
}

/**
 * «المجالس»: the client may emit right after `connect`, before the async
 * `handleConnection` auth has set `client.data.user` — wait briefly for it.
 */
async function councilUserOf(
  client: AuthenticatedSocket,
  timeoutMs = 5000,
): Promise<string | null> {
  const started = Date.now();
  while (!client.data.user && client.connected) {
    if (Date.now() - started > timeoutMs) return null;
    await new Promise((r) => setTimeout(r, 50));
  }
  return client.data.user?.userId ?? null;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, isAllowedCorsOrigin(origin));
    },
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
})
export class AppGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly socketService: SocketGatewayService,
    private readonly emitService: SocketEmitService,
    private readonly redisAdapter: SocketRedisAdapterService,
    private readonly logger: LoggerService,
    private readonly councils: CouncilRealtimeService,
  ) {}

  async afterInit(server: Server) {
    await this.redisAdapter.setupAdapter(server);
    this.emitService.setServer(server);
  }

  async handleConnection(client: AuthenticatedSocket) {
    this.bindCouncilHandlers(client);
    try {
      const user = await this.socketService.authenticate(client);
      client.data.user = user;
      this.logger.info(
        { userId: user.userId, socketId: client.id },
        'Socket connected',
      );
      void client.join(`user:${user.userId}`);
      await this.socketService.onUserConnected(user.userId, client.id);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const user = client.data.user;
    if (!user) return;

    this.logger.info(
      { userId: user.userId, socketId: client.id },
      'Socket disconnected',
    );
    this.socketService.onUserDisconnected(user.userId, client.id);

    // «المجالس»: drop presence; another device of the same user re-adds itself on
    // its next heartbeat. Stage seats are freed later by the stale-speaker sweep.
    for (const councilId of client.data.councils ?? []) {
      void this.councils.left(councilId, user.userId).catch(() => {});
    }
  }

  @SubscribeMessage('chat:join')
  async onChatJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() threadId: unknown,
  ) {
    const parsed = this.socketService.parseUuid(threadId);
    if (!parsed)
      return this.emitErr(client, 'invalid_input', 'Invalid threadId');

    const err = await this.socketService.handleChatJoin(
      parsed,
      client.data.user!.userId,
    );
    if (err) return this.emitErr(client, err.code, err.message);

    void client.join(`thread:${parsed}`);
  }

  @SubscribeMessage('chat:leave')
  onChatLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() threadId: unknown,
  ) {
    const parsed = this.socketService.parseUuid(threadId);
    if (!parsed) return;
    void client.leave(`thread:${parsed}`);
  }

  @SubscribeMessage('chat:send')
  async onChatSend(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() raw: unknown,
  ) {
    const data = this.socketService.validateDto(ChatSendDto, raw);
    if (!data)
      return this.emitErr(client, 'invalid_input', 'Invalid message data');

    const err = await this.socketService.handleChatSend(
      client.data.user!,
      data,
    );
    if (err) this.emitErr(client, err.code, err.message);
  }

  @SubscribeMessage('chat:typing')
  async onChatTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() raw: unknown,
  ) {
    const data = this.socketService.validateDto(ChatTypingDto, raw);
    if (!data) return;

    const err = await this.socketService.handleChatTyping(
      client.data.user!,
      data,
    );
    if (err) this.emitErr(client, err.code, err.message);
  }

  @SubscribeMessage('chat:read')
  async onChatRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() raw: unknown,
  ) {
    const data = this.socketService.validateDto(ChatReadDto, raw);
    if (!data) return;

    const err = await this.socketService.handleChatRead(
      client.data.user!,
      data,
    );
    if (err) this.emitErr(client, err.code, err.message);
  }

  @SubscribeMessage('live:join')
  async onLiveJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() streamId: unknown,
  ) {
    const parsed = this.socketService.parseUuid(streamId);
    if (!parsed)
      return this.emitErr(client, 'invalid_input', 'Invalid streamId');

    const user = client.data.user!;
    const result = await this.socketService.handleLiveJoin(
      parsed,
      user,
      (event, data) => client.emit(event, data),
    );

    if ('code' in result) {
      return this.emitErr(client, result.code, result.message);
    }

    void client.join(`stream:${parsed}`);
    client.data.streamId = parsed;
  }

  @SubscribeMessage('live:leave')
  async onLiveLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() streamId: unknown,
  ) {
    const parsed = this.socketService.parseUuid(streamId);
    if (!parsed) return;

    void client.leave(`stream:${parsed}`);
    await this.socketService.handleLiveLeave(parsed);
  }

  @SubscribeMessage('live:comment')
  async onLiveComment(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() raw: unknown,
  ) {
    const data = this.socketService.validateDto(LiveCommentDto, raw);
    if (!data)
      return this.emitErr(client, 'invalid_input', 'Invalid comment data');

    const err = await this.socketService.handleLiveComment(
      client.data.user!,
      data,
    );
    if (err) this.emitErr(client, err.code, err.message);
  }

  @SubscribeMessage('live:like')
  async onLiveLike(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() streamId: unknown,
  ) {
    const parsed = this.socketService.parseUuid(streamId);
    if (!parsed) return;

    await this.socketService.handleLiveLike(parsed, client.data.user!);
  }

  // ─── «المجالس» ──────────────────────────────────────────────────────────
  // Bound as raw socket listeners (not @SubscribeMessage): the global HTTP
  // guards/interceptors do not support the ws context. Auth comes from the
  // handshake — `handleConnection` disconnects unauthenticated sockets.

  private bindCouncilHandlers(client: AuthenticatedSocket) {
    const bind = (
      event: string,
      fn: (c: AuthenticatedSocket, raw: unknown) => Promise<void>,
    ) =>
      client.on(event, (raw: unknown) => {
        if (!this.councilBudget(client)) return;
        fn(client, raw).catch((err: unknown) => {
          this.logger.warn(
            { err: err instanceof Error ? err.message : String(err), event },
            'Council socket handler failed',
          );
        });
      });
    bind('council:join', (c, raw) => this.onCouncilJoin(c, raw));
    bind('council:leave', (c, raw) => this.onCouncilLeave(c, raw));
    bind('council:heartbeat', (c, raw) => this.onCouncilHeartbeat(c, raw));
  }

  private councilBudget(client: AuthenticatedSocket): boolean {
    const now = Date.now();
    const rate = client.data.councilRate;
    if (!rate || now - rate.windowStart > COUNCIL_MSG_WINDOW_MS) {
      client.data.councilRate = { windowStart: now, count: 1 };
      return true;
    }
    rate.count += 1;
    return rate.count <= COUNCIL_MSG_MAX;
  }

  async onCouncilJoin(client: AuthenticatedSocket, raw: unknown) {
    const councilId = this.socketService.parseUuid(councilIdOf(raw));
    if (!councilId)
      return this.emitErr(client, 'invalid_input', 'Invalid councilId');

    const userId = await councilUserOf(client);
    if (!userId) return;
    const err = await this.councils.socketJoinError(councilId, userId);
    if (err) {
      client.emit('council:error', { councilId, ...err });
      return;
    }
    void client.join(`council:${councilId}`);
    (client.data.councils ??= new Set()).add(councilId);
    await this.councils.touch(councilId, userId);
    await this.councils.emitListenerCount(councilId);
    client.emit('council:joined', { councilId });
  }

  async onCouncilLeave(client: AuthenticatedSocket, raw: unknown) {
    const councilId = this.socketService.parseUuid(councilIdOf(raw));
    const userId = client.data.user?.userId;
    if (!councilId || !userId || !client.data.councils?.has(councilId)) return;
    void client.leave(`council:${councilId}`);
    client.data.councils.delete(councilId);
    await this.councils.left(councilId, userId);
  }

  async onCouncilHeartbeat(client: AuthenticatedSocket, raw: unknown) {
    const councilId = this.socketService.parseUuid(councilIdOf(raw));
    const userId = client.data.user?.userId;
    if (!councilId || !userId || !client.data.councils?.has(councilId)) return;
    await this.councils.touch(councilId, userId);
  }

  @SubscribeMessage('presence:ping')
  onPresencePing(@ConnectedSocket() client: AuthenticatedSocket) {
    const user = client.data.user!;
    this.socketService.onPresencePing(user.userId, client.id);
  }

  @SubscribeMessage('notifications:read')
  async onNotificationsRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() raw: unknown,
  ) {
    await this.socketService.handleNotificationsRead(
      client.data.user!.userId,
      raw,
    );
  }

  @SubscribeMessage('support:join')
  async onSupportJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() raw: unknown,
  ) {
    const data = this.socketService.validateDto(SupportJoinDto, raw);
    if (!data) return this.emitErr(client, 'invalid_input', 'Invalid ticketId');

    const err = await this.socketService.handleSupportJoin(
      client.data.user!,
      data.ticketId,
    );
    if (err) return this.emitErr(client, err.code, err.message);
    void client.join(`support:${data.ticketId}`);
  }

  @SubscribeMessage('support:leave')
  onSupportLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() raw: unknown,
  ) {
    const data = this.socketService.validateDto(SupportJoinDto, raw);
    if (!data) return;
    void client.leave(`support:${data.ticketId}`);
  }

  @SubscribeMessage('support:send')
  async onSupportSend(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() raw: unknown,
  ) {
    const data = this.socketService.validateDto(SupportSendDto, raw);
    if (!data)
      return this.emitErr(client, 'invalid_input', 'Invalid support message');

    const err = await this.socketService.handleSupportSend(
      client.data.user!,
      data,
    );
    if (err) this.emitErr(client, err.code, err.message);
  }

  private emitErr(client: Socket, code: string, message: string) {
    client.emit('error', { code, message });
  }
}
