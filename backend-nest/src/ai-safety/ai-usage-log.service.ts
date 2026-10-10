import { Injectable } from '@nestjs/common';
import { LoggerService } from '../common/services/logger.service';
import { PrismaService } from '../prisma/prisma.service';

export type AiUsageOutcome = 'answered' | 'fallback' | 'escalated' | 'error';

export type AiUsageLogInput = {
  agent: string;
  model: string;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  latencyMs: number;
  outcome: AiUsageOutcome;
  ticketId?: string | null;
};

function nonNeg(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), 1_000_000_000);
}

/** Prisma throws this when the table from an unapplied migration is missing. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'P2021' || code === 'P2022';
}

/**
 * Append-only usage row. Never stores prompts or replies.
 * A missing table (migration not applied yet) is ignored so AI calls continue.
 */
@Injectable()
export class AiUsageLogService {
  private warnedMissing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async record(input: AiUsageLogInput): Promise<void> {
    const delegate = (
      this.prisma as unknown as {
        aiUsageLog?: { create: (args: unknown) => Promise<unknown> };
      }
    ).aiUsageLog;
    if (!delegate) {
      this.warnMissing();
      return;
    }
    try {
      await delegate.create({
        data: {
          agent: input.agent.slice(0, 64),
          model: input.model.slice(0, 64),
          inputTokens: nonNeg(input.inputTokens),
          cachedTokens: nonNeg(input.cachedTokens),
          outputTokens: nonNeg(input.outputTokens),
          latencyMs: nonNeg(input.latencyMs),
          outcome: input.outcome,
          ticketId:
            input.ticketId &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              input.ticketId,
            )
              ? input.ticketId
              : null,
        },
      });
    } catch (err) {
      if (isMissingRelation(err)) {
        this.warnMissing();
        return;
      }
      this.logger.warn(
        { errorName: err instanceof Error ? err.name : undefined },
        'AI usage log write failed',
      );
    }
  }

  private warnMissing() {
    if (this.warnedMissing) return;
    this.warnedMissing = true;
    this.logger.warn(
      {},
      'AI usage log table is missing — counts stay in Redis only until the migration is applied',
    );
  }
}
