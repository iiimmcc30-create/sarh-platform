import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { LoggerService } from '../../common/services/logger.service';
import { QUEUE_NAMES } from '../constants';
import type { ImageJob } from '../types/queue.types';

@Injectable()
@Processor(QUEUE_NAMES.IMAGE_PROCESSING, { concurrency: 2 })
export class ImageProcessingProcessor extends WorkerHost {
  constructor(private readonly logger: LoggerService) {
    super();
  }

  async process(job: Job<ImageJob>): Promise<void> {
    if (job.name !== 'process') return;

    this.logger.debug(
      {
        fileKey: job.data.fileKey,
        bucket: job.data.bucket,
        operations: job.data.operations,
      },
      'Image processing job received (no-op stub)',
    );
  }
}
