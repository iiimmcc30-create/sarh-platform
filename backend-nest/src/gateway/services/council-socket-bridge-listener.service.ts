import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import IORedis from 'ioredis';
import { LoggerService } from '../../common/services/logger.service';
import { getSharedRedisClient } from '../../redis/redis-connection';
import { SocketEmitService } from './socket-emit.service';
import {
  COUNCIL_EMIT_CHANNEL,
  isValidCouncilEmit,
} from './council-socket-bridge.service';

/** Socket-process side of the «المجالس» bridge: re-emits validated council events. */
@Injectable()
export class CouncilSocketBridgeListenerService
  implements OnModuleInit, OnModuleDestroy
{
  private sub: IORedis | null = null;

  constructor(
    private readonly emitService: SocketEmitService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit() {
    if (process.env.REDIS_ENABLED === 'false') return;

    // Dedicated connection kind (unused elsewhere) so we own its lifecycle.
    this.sub = getSharedRedisClient(3, 'listener-sub');
    this.sub.on('error', (err) => {
      this.logger.error({ err: err.message }, 'Council bridge sub error');
    });

    const sub = this.sub;
    const ready =
      sub.status === 'wait' ? sub.connect() : Promise.resolve(undefined);
    void ready
      .then(() => sub.subscribe(COUNCIL_EMIT_CHANNEL))
      .then(() => {
        sub.on('message', (channel: string, raw: string) => {
          if (channel !== COUNCIL_EMIT_CHANNEL) return;
          this.handle(raw);
        });
        this.logger.info({}, 'Subscribed to council emit channel');
      })
      .catch((err: unknown) => {
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Council bridge listener unavailable',
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
    if (!isValidCouncilEmit(msg)) return;
    this.emitService.getServer()?.to(msg.room).emit(msg.event, msg.data);
  }

  onModuleDestroy() {
    this.sub = null;
  }
}
