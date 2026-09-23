import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';
import { LoggerService } from '../../common/services/logger.service';
import { getSharedRedisClient } from '../../redis/redis-connection';

const DISCONNECT_CHANNEL = 'socket:disconnect';

@Injectable()
export class SocketDisconnectService implements OnModuleInit, OnModuleDestroy {
  private pub: IORedis | null = null;

  constructor(private readonly logger: LoggerService) {}

  onModuleInit() {
    if (process.env.REDIS_ENABLED === 'false') return;
    if (process.env.SOCKET_USE_MEMORY_ADAPTER === 'true') return;

    this.pub = getSharedRedisClient(3, 'default');
    if (this.pub.status !== 'ready') {
      this.pub.connect().catch(() => {
        this.logger.warn({}, 'Socket disconnect pub client unavailable');
      });
    }
  }

  onModuleDestroy() {
    this.pub = null;
  }

  async disconnectUser(userId: string): Promise<void> {
    try {
      if (this.pub?.status === 'ready') {
        await this.pub.publish(DISCONNECT_CHANNEL, userId);
      }
    } catch (err) {
      this.logger.error(
        { err: err instanceof Error ? err.message : String(err), userId },
        'Failed to publish socket disconnect',
      );
    }
  }
}

export { DISCONNECT_CHANNEL };
