import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import IORedis from 'ioredis';
import { LoggerService } from '../../common/services/logger.service';
import { getSharedRedisClient } from '../../redis/redis-connection';
import { SocketEmitService } from './socket-emit.service';

/**
 * Live-stream realtime bridge. The REST API (LiveKit webhooks) runs in a
 * different process from Socket.IO, so viewer-count and stream-ended events
 * are published on Redis and re-emitted by the socket process. Only
 * `live:viewers` / `live:ended` to `stream:<uuid>` rooms are accepted.
 */
export const LIVE_EMIT_CHANNEL = 'socket:live-emit';

const UUID = '[0-9a-fA-F-]{36}';
const ROOM_RE = new RegExp(`^stream:${UUID}$`);
const EVENT_RE = /^live:(viewers|ended)$/;

export type LiveEmitMessage = {
  room: string;
  event: string;
  data: unknown;
};

export function isValidLiveEmit(msg: unknown): msg is LiveEmitMessage {
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
export class LiveSocketBridgeService implements OnModuleInit, OnModuleDestroy {
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
        this.logger.warn({}, 'Live bridge pub client unavailable');
      });
    }
  }

  onModuleDestroy() {
    this.pub = null;
  }

  toStream(
    streamId: string,
    event: 'live:viewers' | 'live:ended',
    data: unknown,
  ) {
    this.emit({ room: `stream:${streamId}`, event, data });
  }

  private emit(msg: LiveEmitMessage): void {
    if (!isValidLiveEmit(msg)) return;
    const server = this.emitService.getServer();
    if (server) {
      server.to(msg.room).emit(msg.event, msg.data);
      return;
    }
    if (this.pub?.status !== 'ready') return;
    this.pub
      .publish(LIVE_EMIT_CHANNEL, JSON.stringify(msg))
      .catch((err: unknown) => {
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Live bridge publish failed',
        );
      });
  }
}
