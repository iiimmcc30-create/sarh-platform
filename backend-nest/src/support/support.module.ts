import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { GatewaySharedModule } from '../gateway/gateway-shared.module';
import { SupportController } from './support.controller';
import { AdminSupportController } from './admin-support.controller';
import { SupportRepository } from './repositories/support.repository';
import { SupportTicketsService } from './services/support-tickets.service';
import { AccountVerificationService } from './services/account-verification.service';
import { FaqService } from './services/faq.service';
import { SupportNotificationsService } from './services/support-notifications.service';
import { SupportSeedService } from './services/support-seed.service';
import { AI_PROVIDER } from './ai/ai-provider';
import { createAiProvider } from './ai/create-ai-provider';
import { SarhanSupportService } from './ai/sarhan-support.service';
import { SupportAiContextService } from './ai/support-ai-context.service';
import { LoggerService } from '../common/services/logger.service';
import { AiSafetyModule } from '../ai-safety/ai-safety.module';
import { AiCallGuardService } from '../ai-safety/ai-call-guard.service';
import { AiAgentsModule } from '../ai-agents/ai-agents.module';
import { CsAccountReads } from '../ai-agents/cs/cs-account-reads';
import { CsAgentService } from '../ai-agents/cs/cs-agent.service';
import { FeesModule } from '../fees/fees.module';

@Module({
  imports: [
    PrismaModule,
    QueueModule,
    GatewaySharedModule,
    AiSafetyModule,
    AiAgentsModule,
    FeesModule,
  ],
  controllers: [SupportController, AdminSupportController],
  providers: [
    SupportRepository,
    SupportTicketsService,
    AccountVerificationService,
    FaqService,
    SupportNotificationsService,
    SupportSeedService,
    SupportAiContextService,
    SarhanSupportService,
    CsAccountReads,
    CsAgentService,
    {
      provide: AI_PROVIDER,
      useFactory: (logger: LoggerService, guard: AiCallGuardService) =>
        createAiProvider(logger, guard),
      inject: [LoggerService, AiCallGuardService],
    },
  ],
  exports: [SupportTicketsService, AccountVerificationService, FaqService],
})
export class SupportModule {}
