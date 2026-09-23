import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import IORedis from 'ioredis';
import { Server } from 'socket.io';
import { LoggerService } from '../../common/services/logger.service';
import { getSharedRedisClient } from '../../redis/redis-connection';

const IS_DEV = process.env.NODE_ENV !== 'production';
const FORCE_MEMORY = process.env.SOCKET_USE_MEMORY_ADAPTER === 'true';

@Injectable()
export class SocketRedisAdapterService implements OnModuleDestroy {
  private pubClient: IORedis | null = null;
  private subClient: IORedis | null = null;

  constructor(private readonly logger: LoggerService) {}

  async setupAdapter(server: Server): Promise<void> {
    if (FORCE_MEMORY) {
      this.logger.warn(
        {},
        'SOCKET_USE_MEMORY_ADAPTER=true — using in-memory Socket.IO adapter',
      );
      return;
    }

    const pubClient = getSharedRedisClient(3, 'default');
    pubClient.on('error', () => {});

    try {
      if (pubClient.status !== 'ready') {
        await pubClient.connect();
      }
      await pubClient.ping();
    } catch (err) {
      if (!IS_DEV) {
        throw err;
      }
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Redis unavailable — using in-memory Socket.IO adapter (dev single-instance)',
      );
      return;
    }

    this.pubClient = pubClient;
    this.subClient = getSharedRedisClient(3, 'subscriber');

    if (this.subClient.status !== 'ready') {
      await this.subClient.connect();
    }

    server.adapter(createAdapter(this.pubClient, this.subClient));

    this.pubClient.on('error', (err) =>
      this.logger.error({ err: err.message }, 'Socket Redis pub error'),
    );
    this.subClient.on('error', (err) =>
      this.logger.error({ err: err.message }, 'Socket Redis sub error'),
    );
    this.logger.info({}, 'Socket.IO Redis adapter connected');
  }

  onModuleDestroy() {
    this.pubClient = null;
    this.subClient = null;
  }
}
