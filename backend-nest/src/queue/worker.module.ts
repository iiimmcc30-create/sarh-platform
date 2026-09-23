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

/**
 * Standalone worker process graph. Kept out of queue.module.ts so
 * QueueModule stays free of butcher Daftra imports.
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
    WorkerCronService,
    WorkerHeartbeatService,
  ],
})
export class WorkerModule {}
