import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { LoggerService } from '../../common/services/logger.service';
import { QUEUE_NAMES } from '../constants';
import type { FeeCheckJob } from '../types/queue.types';

/**
 * ListingFee is a covenant commitment, not a publish countdown.
 * Jobs must not mark listings pending_fee or notify sellers.
 */
@Injectable()
@Processor(QUEUE_NAMES.FEE_CHECKS, { concurrency: 5 })
export class FeeCheckProcessor extends WorkerHost {
  constructor(private readonly logger: LoggerService) {
    super();
  }

  async process(job: Job<FeeCheckJob>): Promise<void> {
    this.logger.info(
      { jobId: job.id, jobName: job.name },
      'Listing fee check skipped — no listing-status or notification side effects',
    );
  }
}
