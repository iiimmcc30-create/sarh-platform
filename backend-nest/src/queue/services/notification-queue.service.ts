import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';
import { LoggerService } from '../../common/services/logger.service';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { QUEUE_NAMES } from '../constants';
import type { NotificationJob } from '../types/queue.types';
import { NotificationPersistService } from './notification-persist.service';

@Injectable()
export class NotificationQueueService {
  constructor(
    @Optional()
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS)
    private readonly queue: Queue | null,
    private readonly cache: RedisCacheService,
    private readonly persist: NotificationPersistService,
    private readonly logger: LoggerService,
  ) {}

  isEnabled(): boolean {
    return this.cache.isEnabled();
  }

  async addNotification(job: NotificationJob) {
    if (!this.isEnabled() || !this.queue) {
      await this.persist
        .persistNotificationAndEnqueuePush(job)
        .catch((err) =>
          this.logger.warn(
            { err },
            'Direct notification write failed (no Redis)',
          ),
        );
      return null;
    }
    return this.queue.add('create', job, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  }

  async getJobCounts() {
    if (!this.queue) return {};
    return this.queue.getJobCounts();
  }
}
