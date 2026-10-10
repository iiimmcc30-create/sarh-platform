import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AiBudgetService } from './ai-budget.service';
import { AiCallGuardService } from './ai-call-guard.service';

/** Shared guard for outbound AI calls (switches, daily budget, timeout). */
@Module({
  imports: [CommonModule],
  providers: [AiBudgetService, AiCallGuardService],
  exports: [AiBudgetService, AiCallGuardService],
})
export class AiSafetyModule {}
