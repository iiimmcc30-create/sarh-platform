import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { EmailProcessor } from './processors/email.processor';
import { FeeCheckProcessor } from './processors/fee-check.processor';
import { ImageProcessingProcessor } from './processors/image-processing.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { PushProcessor } from './processors/push.processor';
import { SubscriptionProcessor } from './processors/subscription.processor';
import { QueueModule } from './queue.module';
import { WorkerCronService } from './services/worker-cron.service';
import { WorkerHeartbeatService } from './services/worker-heartbeat.service';
import { SupportRepository } from '../support/repositories/support.repository';
import { SupportNotificationsService } from '../support/services/support-notifications.service';
import { SupportHandoffReminderService } from '../support/services/support-handoff-reminder.service';

/**
 * Standalone worker process graph. Kept out of queue.module.ts.
 */
@Module({
  imports: [QueueModule, SubscriptionsModule, KnowledgeModule],
  providers: [
    NotificationProcessor,
    PushProcessor,
    EmailProcessor,
    FeeCheckProcessor,
    ImageProcessingProcessor,
    SubscriptionProcessor,
    SupportRepository,
    SupportNotificationsService,
    SupportHandoffReminderService,
    WorkerCronService,
    WorkerHeartbeatService,
  ],
})
export class WorkerModule {}
