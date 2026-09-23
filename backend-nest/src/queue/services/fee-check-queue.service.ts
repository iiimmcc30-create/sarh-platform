import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { QUEUE_NAMES } from '../constants';
import { feeCheckJobId } from '../job-id';
import type { FeeCheckJob } from '../types/queue.types';

@Injectable()
export class FeeCheckQueueService {
  constructor(
    @Optional()
    @InjectQueue(QUEUE_NAMES.FEE_CHECKS)
    private readonly queue: Queue | null,
    private readonly cache: RedisCacheService,
  ) {}

  async scheduleFeeCheck(job: FeeCheckJob, delayMs: number) {
    if (!this.cache.isEnabled() || !this.queue) return null;
    return this.queue.add('check', job, {
      delay: Math.max(0, delayMs),
      attempts: 2,
      jobId: feeCheckJobId(job.listingFeeId),
    });
  }

  async addFeeCheck(job: FeeCheckJob) {
    if (!this.cache.isEnabled() || !this.queue) return null;
    return this.queue.add('check', job, {
      jobId: feeCheckJobId(job.listingFeeId),
      attempts: 3,
    });
  }

  /** Idempotent connectivity probe — processor no-ops missing fees. */
  async addProbeJob() {
    if (!this.cache.isEnabled() || !this.queue) return null;
    return this.queue.add(
      'probe',
      {
        listingFeeId: '00000000-0000-4000-8000-000000000000',
        userId: '00000000-0000-4000-8000-000000000000',
        amount: 0,
      },
      {
        jobId: `fee-probe-${Date.now()}`,
        attempts: 1,
        removeOnComplete: 20,
        removeOnFail: 20,
      },
    );
  }
}
