import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { LoggerService } from '../../common/services/logger.service';
import { QUEUE_NAMES } from '../constants';
import type { SubscriptionJob } from '../types/queue.types';
import { SubscriptionLifecycleService } from '../../subscriptions/services/subscription-lifecycle.service';
import { SubscriptionLifecycleRepository } from '../../subscriptions/repositories/subscription-lifecycle.repository';

@Injectable()
@Processor(QUEUE_NAMES.SUBSCRIPTIONS, { concurrency: 3 })
export class SubscriptionProcessor extends WorkerHost {
  constructor(
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly subscriptionRepo: SubscriptionLifecycleRepository,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async process(job: Job<SubscriptionJob>): Promise<void> {
    const data = job.data;

    switch (data.kind) {
      case 'expire': {
        const count = await this.lifecycle.processExpirationBatch();
        this.logger.info({ count }, 'Subscription expiration batch complete');
        return;
      }
      case 'reminders': {
        const sent = await this.lifecycle.processReminderBatch();
        this.logger.info({ sent }, 'Subscription reminder batch complete');
        return;
      }
      case 'reset_live_minutes': {
        const result = await this.subscriptionRepo.resetMonthlyUsageCounters();
        this.logger.info(
          { count: result.count },
          'Monthly usage counters reset',
        );
        return;
      }
      case 'auto_renew_attempt': {
        await this.lifecycle.notifyRenewalFailed(data.userId, 'subscription');
        this.logger.warn(
          { userId: data.userId, subscriptionId: data.subscriptionId },
          'Auto-renew requires manual payment — notification sent',
        );
        return;
      }
      default:
        this.logger.warn({ jobName: job.name }, 'Unknown subscription job');
    }
  }
}
