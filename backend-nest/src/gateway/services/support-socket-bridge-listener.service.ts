import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import IORedis from 'ioredis';
import { LoggerService } from '../../common/services/logger.service';
import { getSharedRedisClient } from '../../redis/redis-connection';
import { SocketEmitService } from './socket-emit.service';
import {
  SUPPORT_EMIT_CHANNEL,
  isValidSupportEmit,
} from './support-socket-bridge.service';

/** Socket-process side: re-emits a ticket-id ping so the app refetches. */
@Injectable()
export class SupportSocketBridgeListenerService
  implements OnModuleInit, OnModuleDestroy
{
  private sub: IORedis | null = null;

  constructor(
    private readonly emitService: SocketEmitService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit() {
    if (process.env.REDIS_ENABLED === 'false') return;
    this.sub = getSharedRedisClient(3, 'listener-sub');
    this.sub.on('error', (err) => {
      this.logger.error({ err: err.message }, 'Support bridge sub error');
    });
    const sub = this.sub;
    const ready =
      sub.status === 'wait' ? sub.connect() : Promise.resolve(undefined);
    void ready
      .then(() => sub.subscribe(SUPPORT_EMIT_CHANNEL))
      .then(() => {
        sub.on('message', (channel: string, raw: string) => {
          if (channel !== SUPPORT_EMIT_CHANNEL) return;
          this.handle(raw);
        });
        this.logger.info({}, 'Subscribed to support emit channel');
      })
      .catch((err: unknown) => {
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Support bridge listener unavailable',
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
    if (!isValidSupportEmit(msg)) return;
    this.emitService
      .getServer()
      ?.to(`support:${msg.ticketId}`)
      .emit('support:message', { ticketId: msg.ticketId });
  }

  onModuleDestroy() {
    this.sub = null;
  }
}
