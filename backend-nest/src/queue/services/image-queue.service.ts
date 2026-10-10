import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { QUEUE_NAMES } from '../constants';
import type { ImageJob } from '../types/queue.types';

@Injectable()
export class ImageQueueService {
  constructor(
    @Optional()
    @InjectQueue(QUEUE_NAMES.IMAGE_PROCESSING)
    private readonly queue: Queue | null,
    private readonly cache: RedisCacheService,
  ) {}

  async addImageProcessing(job: ImageJob) {
    if (!this.cache.isEnabled() || !this.queue) return null;
    return this.queue.add('process', job, { attempts: 2 });
  }

  async retryFailed(max: number): Promise<number> {
    if (!this.queue) return 0;
    const jobs = await this.queue.getFailed(0, Math.max(0, max - 1));
    for (const job of jobs) await job.retry();
    return jobs.length;
  }
}
