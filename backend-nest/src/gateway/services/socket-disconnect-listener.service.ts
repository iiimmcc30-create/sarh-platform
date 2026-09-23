import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import IORedis from 'ioredis';
import { LoggerService } from '../../common/services/logger.service';
import { getSharedRedisClient } from '../../redis/redis-connection';
import { DISCONNECT_CHANNEL } from './socket-disconnect.service';
import { SocketEmitService } from './socket-emit.service';

@Injectable()
export class SocketDisconnectListenerService
  implements OnModuleInit, OnModuleDestroy
{
  private sub: IORedis | null = null;

  constructor(
    private readonly emitService: SocketEmitService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit() {
    if (process.env.REDIS_ENABLED === 'false') return;
    if (process.env.SOCKET_USE_MEMORY_ADAPTER === 'true') return;

    this.sub = getSharedRedisClient(3, 'subscriber');

    this.sub.on('error', (err) => {
      this.logger.error({ err: err.message }, 'Socket disconnect sub error');
    });

    void this.sub
      .connect()
      .then(() => this.sub!.subscribe(DISCONNECT_CHANNEL))
      .then(() => {
        this.sub!.on('message', (channel, userId) => {
          if (channel !== DISCONNECT_CHANNEL || !userId) return;
          void this.emitService.disconnectUserSockets(userId).then(() => {
            this.logger.info(
              { userId },
              'Disconnected user sockets via Redis channel',
            );
          });
        });
        this.logger.info({}, 'Subscribed to socket:disconnect channel');
      })
      .catch((err) => {
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Socket disconnect listener unavailable',
        );
      });
  }

  onModuleDestroy() {
    this.sub = null;
  }
}
