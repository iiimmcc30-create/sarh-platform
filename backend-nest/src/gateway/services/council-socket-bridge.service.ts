import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import IORedis from 'ioredis';
import { LoggerService } from '../../common/services/logger.service';
import { getSharedRedisClient } from '../../redis/redis-connection';
import { SocketEmitService } from './socket-emit.service';

/**
 * «المجالس» realtime bridge. The REST API runs in a different process than the
 * Socket.IO server (SocketEmitService has no server there), so council events are
 * published on a Redis channel and re-emitted by the socket service — the same
 * pattern as SocketDisconnectService. Only `council:*` events to `council:<uuid>` /
 * `user:<uuid>` rooms are accepted.
 */
export const COUNCIL_EMIT_CHANNEL = 'socket:council-emit';

const UUID = '[0-9a-fA-F-]{36}';
const ROOM_RE = new RegExp(`^(council|user):${UUID}$`);
const EVENT_RE = /^council:[a-z-]{2,40}$/;

export type CouncilEmitMessage = {
  room: string;
  event: string;
  data: unknown;
};

export function isValidCouncilEmit(msg: unknown): msg is CouncilEmitMessage {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return (
    typeof m.room === 'string' &&
    typeof m.event === 'string' &&
    ROOM_RE.test(m.room) &&
    EVENT_RE.test(m.event)
  );
}

@Injectable()
export class CouncilSocketBridgeService
  implements OnModuleInit, OnModuleDestroy
{
  private pub: IORedis | null = null;

  constructor(
    private readonly emitService: SocketEmitService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit() {
    if (process.env.REDIS_ENABLED === 'false') return;
    this.pub = getSharedRedisClient(3, 'default');
    if (this.pub.status === 'wait') {
      this.pub.connect().catch(() => {
        this.logger.warn({}, 'Council bridge pub client unavailable');
      });
    }
  }

  onModuleDestroy() {
    this.pub = null;
  }

  toCouncil(councilId: string, event: string, data: unknown): void {
    this.emit({ room: `council:${councilId}`, event, data });
  }

  toUser(userId: string, event: string, data: unknown): void {
    this.emit({ room: `user:${userId}`, event, data });
  }

  private emit(msg: CouncilEmitMessage): void {
    if (!isValidCouncilEmit(msg)) return;
    // Inside the socket process: emit directly (Redis adapter fans out).
    const server = this.emitService.getServer();
    if (server) {
      server.to(msg.room).emit(msg.event, msg.data);
      return;
    }
    if (this.pub?.status !== 'ready') return;
    this.pub
      .publish(COUNCIL_EMIT_CHANNEL, JSON.stringify(msg))
      .catch((err: unknown) => {
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Council bridge publish failed',
        );
      });
  }
}
