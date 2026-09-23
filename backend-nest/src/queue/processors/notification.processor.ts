import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { LoggerService } from '../../common/services/logger.service';
import { QUEUE_NAMES } from '../constants';
import type { NotificationJob } from '../types/queue.types';
import { NotificationPersistService } from '../services/notification-persist.service';

@Injectable()
@Processor(QUEUE_NAMES.NOTIFICATIONS, { concurrency: 10 })
export class NotificationProcessor extends WorkerHost {
  constructor(
    private readonly persist: NotificationPersistService,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<NotificationJob>): Promise<void> {
    if (job.name === 'create') {
      await this.persist.persistNotificationAndEnqueuePush(job.data, job.id);
      return;
    }
    this.logger.warn({ jobName: job.name }, 'Unknown notification job name');
  }
}
