import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';
import { LoggerService } from '../../common/services/logger.service';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { QUEUE_NAMES } from '../constants';
import type { PushJob } from '../types/queue.types';

@Injectable()
export class PushQueueService {
  constructor(
    @Optional()
    @InjectQueue(QUEUE_NAMES.PUSH)
    private readonly queue: Queue | null,
    private readonly cache: RedisCacheService,
    private readonly logger: LoggerService,
  ) {}

  async addPush(job: PushJob) {
    if (!this.cache.isEnabled() || !this.queue) return null;
    try {
      return await this.queue.add('send', job, { attempts: 2 });
    } catch (err) {
      this.logger.warn({ err }, 'Failed to enqueue push notification');
      return null;
    }
  }
}
