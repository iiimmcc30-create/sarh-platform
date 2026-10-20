import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import IORedis from 'ioredis';
import { LoggerService } from '../../common/services/logger.service';
import { getSharedRedisClient } from '../../redis/redis-connection';
import { SocketEmitService } from './socket-emit.service';
import {
  isValidLiveEmit,
  LIVE_EMIT_CHANNEL,
} from './live-socket-bridge.service';

/** Socket-process side of the live bridge: re-emits validated live events. */
@Injectable()
export class LiveSocketBridgeListenerService
  implements OnModuleInit, OnModuleDestroy
{
  private sub: IORedis | null = null;

  constructor(
    private readonly emitService: SocketEmitService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit() {
    if (process.env.REDIS_ENABLED === 'false') return;
    // Same subscriber socket as the council bridge: one Redis connection can
    // subscribe to several channels, and each listener filters its own.
    this.sub = getSharedRedisClient(3, 'listener-sub');
    this.sub.on('error', (err) => {
      this.logger.error({ err: err.message }, 'Live bridge sub error');
    });
    const sub = this.sub;
    const ready =
      sub.status === 'wait' ? sub.connect() : Promise.resolve(undefined);
    void ready
      .then(() => sub.subscribe(LIVE_EMIT_CHANNEL))
      .then(() => {
        sub.on('message', (channel: string, raw: string) => {
          if (channel !== LIVE_EMIT_CHANNEL) return;
          this.handle(raw);
        });
        this.logger.info({}, 'Subscribed to live emit channel');
      })
      .catch((err: unknown) => {
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Live bridge listener unavailable',
        );
      });
  }

  handle(raw: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isValidLiveEmit(msg)) return;
    this.emitService.getServer()?.to(msg.room).emit(msg.event, msg.data);
  }

  onModuleDestroy() {
    this.sub = null;
  }
}
