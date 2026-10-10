import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AiBudgetService } from './ai-budget.service';
import { AiCallGuardService } from './ai-call-guard.service';
import { AiUsageLogService } from './ai-usage-log.service';
import { AiRuntimeFlagsService } from './ai-runtime-flags.service';

/** Shared guard for outbound AI calls (switches, daily budget, timeout). */
@Module({
  imports: [CommonModule],
  providers: [
    AiBudgetService,
    AiCallGuardService,
    AiUsageLogService,
    AiRuntimeFlagsService,
  ],
  exports: [
    AiBudgetService,
    AiCallGuardService,
    AiUsageLogService,
    AiRuntimeFlagsService,
  ],
})
export class AiSafetyModule {}
