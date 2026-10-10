import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AiBudgetService } from './ai-budget.service';
import { AiCallGuardService } from './ai-call-guard.service';
import { AiUsageLogService } from './ai-usage-log.service';

/** Shared guard for outbound AI calls (switches, daily budget, timeout). */
@Module({
  imports: [CommonModule],
  providers: [AiBudgetService, AiCallGuardService, AiUsageLogService],
  exports: [AiBudgetService, AiCallGuardService, AiUsageLogService],
})
export class AiSafetyModule {}
