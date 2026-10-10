import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';
import { LoggerService } from '../../common/services/logger.service';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { QUEUE_NAMES } from '../constants';
import {
  isAllowedEmailTemplate,
  isSafeEmailAddress,
} from '../processors/email.sanitize';
import type { EmailJob } from '../types/queue.types';

@Injectable()
export class EmailQueueService {
  constructor(
    @Optional()
    @InjectQueue(QUEUE_NAMES.EMAILS)
    private readonly queue: Queue | null,
    private readonly cache: RedisCacheService,
    private readonly logger: LoggerService,
  ) {}

  /** `opts.jobId` makes the enqueue idempotent (BullMQ ignores a duplicate id). */
  async addEmail(job: EmailJob, opts: { jobId?: string } = {}) {
    if (!isSafeEmailAddress(job.to) || !isAllowedEmailTemplate(job.template)) {
      this.logger.warn(
        { to: job.to, template: job.template },
        'Rejected email job — invalid recipient or template',
      );
      return null;
    }
    if (!this.cache.isEnabled() || !this.queue) return null;
    try {
      return await this.queue.add('send', job, {
        ...(opts.jobId ? { jobId: opts.jobId } : {}),
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
    } catch (err) {
      this.logger.warn({ err }, 'Failed to enqueue email');
      return null;
    }
  }
}
