import { forwardRef, Module } from '@nestjs/common';
import { FeesModule } from '../../fees/fees.module';
import { AiSafetyModule } from '../../ai-safety/ai-safety.module';
import { SubscriptionsModule } from '../../subscriptions/subscriptions.module';
import { AdminAiController } from '../../support/admin-ai.controller';
import { SupportModule } from '../../support/support.module';
import { CS_WRITE_API } from './cs-write-tools';
import { SupportTicketsService } from '../../support/services/support-tickets.service';
import { AiAgentsModule } from '../ai-agents.module';
import { AiAdminService } from '../admin/ai-admin.service';
import { SafeActionService } from '../tech/safe-action.service';
import { TechAgentService } from '../tech/tech-agent.service';
import { TechDraftStore } from '../tech/tech-draft-store';
import { TechOpsService } from '../tech/tech-ops.service';
import { CsAccountReads } from './cs-account-reads';
import { CsAgentService } from './cs-agent.service';
import { CsQualityService } from './cs-quality';
import { CsWriteBudget } from './cs-write-budget';

/**
 * Customer-service agent and its billing/fees reads. Imported by the API
 * only. The socket process keeps SupportModule for ticket rooms and must
 * not load this graph.
 */
@Module({
  imports: [
    AiSafetyModule,
    AiAgentsModule,
    FeesModule,
    SubscriptionsModule,
    forwardRef(() => SupportModule),
  ],
  controllers: [AdminAiController],
  providers: [
    CsAccountReads,
    CsWriteBudget,
    CsQualityService,
    CsAgentService,
    TechDraftStore,
    TechOpsService,
    TechAgentService,
    SafeActionService,
    AiAdminService,
    {
      provide: CS_WRITE_API,
      useExisting: forwardRef(() => SupportTicketsService),
    },
  ],
  exports: [CsAgentService, CsQualityService, AiAdminService],
})
export class CsAgentModule {}
