import { Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { QUEUE_NAMES } from '../constants';
import type { SubscriptionJob } from '../types/queue.types';

@Injectable()
export class SubscriptionQueueService {
  constructor(
    @Optional()
    @InjectQueue(QUEUE_NAMES.SUBSCRIPTIONS)
    private readonly queue: Queue<SubscriptionJob> | null,
    private readonly cache: RedisCacheService,
  ) {}

  async addSubscriptionJob(
    job: SubscriptionJob,
    opts?: { delay?: number },
  ): Promise<void> {
    if (!this.cache.isEnabled() || !this.queue) return;
    await this.queue.add(job.kind, job, {
      removeOnComplete: 50,
      removeOnFail: 100,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      ...opts,
    });
  }
}
