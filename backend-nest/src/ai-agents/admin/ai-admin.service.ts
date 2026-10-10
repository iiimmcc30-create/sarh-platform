import { Injectable } from '@nestjs/common';
import { AiBudgetService } from '../../ai-safety/ai-budget.service';
import {
  aiDailyRequestLimit,
  aiDailyTokenBudget,
} from '../../ai-safety/ai-flags';
import { riyadhDay } from '../../ai-safety/ai-budget.service';
import { AiRuntimeFlagsService, isAiControlFlag } from '../../ai-safety/ai-runtime-flags.service';
import { AiUsageLogService } from '../../ai-safety/ai-usage-log.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { AiAuditService } from '../core/audit.service';
import { TechAgentService } from '../tech/tech-agent.service';
import { TechDraftStore } from '../tech/tech-draft-store';

function riyadhStart(day: string): Date {
  return new Date(`${day}T00:00:00+03:00`);
}

@Injectable()
export class AiAdminService {
  constructor(
    private readonly flags: AiRuntimeFlagsService,
    private readonly budget: AiBudgetService,
    private readonly usage: AiUsageLogService,
    private readonly audit: AiAuditService,
    private readonly drafts: TechDraftStore,
    private readonly tech: TechAgentService,
  ) {}

  async dashboard() {
    await this.flags.refresh();
    const usage = await this.budget.usageToday();
    const outcomes = await this.usage.outcomeCountsSince(riyadhStart(riyadhDay()));
    const [cs, tech] = await Promise.all([
      this.audit.list('cs', 8),
      this.audit.list('tech', 8),
    ]);
    return {
      flags: this.flags.snapshot(),
      usage: {
        ...usage,
        tokenBudget: aiDailyTokenBudget(),
        requestLimit: aiDailyRequestLimit(),
      },
      outcomes,
      audit: [...cs, ...tech].slice(0, 8).map(publicAudit),
      drafts: await this.drafts.list(),
    };
  }

  async setFlag(admin: JwtPayload, name: string, enabled: boolean) {
    if (admin.role !== 'ADMIN') {
      return { ok: false as const, reason: 'forbidden' as const };
    }
    if (!isAiControlFlag(name)) {
      return { ok: false as const, reason: 'unknown' as const };
    }
    const result = await this.flags.setFlag(name, enabled);
    await this.audit.append({
      agent: 'tech',
      actorKind: 'admin',
      actorId: admin.userId,
      tool: `flag:${name}`,
      inputJson: '{}',
      resultSummary: `${result.ok ? (enabled ? 'cleared' : 'off') : 'env_ceiling'}:${admin.username}`.slice(
        0,
        240,
      ),
      status: result.ok ? 'ok' : 'denied',
      durationMs: 0,
    });
    return result;
  }

  runTech(admin: JwtPayload) {
    if (admin.role !== 'ADMIN') {
      return Promise.resolve({ ran: false, drafted: false, reason: 'forbidden' as const });
    }
    return this.tech.observe(admin.userId);
  }
}

function publicAudit(row: unknown) {
  const value = row as {
    tool?: string;
    status?: string;
    resultSummary?: string;
    createdAt?: Date | string;
    actorKind?: string;
  };
  return {
    tool: value.tool ?? '',
    status: value.status ?? '',
    resultSummary: value.resultSummary ?? '',
    createdAt: value.createdAt ?? null,
    actorKind: value.actorKind ?? '',
  };
}
