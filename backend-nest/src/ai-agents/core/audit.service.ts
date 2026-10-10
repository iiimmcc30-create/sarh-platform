import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../common/services/logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PiiPseudonymizer } from '../../ai-safety/pii-redaction';

export type AuditAgent = 'cs' | 'tech';
export type AuditActorKind = 'user' | 'system' | 'admin';
export type AuditStatus = 'ok' | 'denied' | 'error';

export type AuditAppend = {
  agent: AuditAgent;
  actorKind: AuditActorKind;
  actorId?: string;
  tool: string;
  inputJson: string;
  resultSummary: string;
  status: AuditStatus;
  durationMs: number;
};

const INPUT_CAP = 2_000;
const SUMMARY_CAP = 240;

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'P2021' || code === 'P2022';
}

function cap(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max);
}

type AuditDelegate = {
  create: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<unknown[]>;
};

/**
 * Append and list only. Rows are not updated or deleted from this repository.
 * A missing table (migration not applied) writes nothing and lists nothing.
 */
@Injectable()
export class AiAuditService {
  private warnedMissing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  private delegate(): AuditDelegate | null {
    const row = (
      this.prisma as unknown as { aiAuditLog?: AuditDelegate }
    ).aiAuditLog;
    return row ?? null;
  }

  async append(input: AuditAppend): Promise<void> {
    const delegate = this.delegate();
    if (!delegate) {
      this.warnMissing();
      return;
    }
    const pii = new PiiPseudonymizer();
    try {
      await delegate.create({
        data: {
          agent: input.agent,
          actorKind: input.actorKind,
          actorId: input.actorId?.slice(0, 64) || null,
          tool: input.tool.slice(0, 64),
          inputJson: cap(pii.redact(input.inputJson), INPUT_CAP),
          resultSummary: cap(pii.redact(input.resultSummary), SUMMARY_CAP),
          status: input.status,
          durationMs: Math.max(0, Math.floor(input.durationMs)),
        },
      });
    } catch (err) {
      if (isMissingRelation(err)) {
        this.warnMissing();
        return;
      }
      this.logger.warn(
        { errorName: err instanceof Error ? err.name : undefined },
        'AI audit log write failed',
      );
    }
  }

  async list(agent: AuditAgent, take = 50): Promise<unknown[]> {
    const delegate = this.delegate();
    if (!delegate) return [];
    try {
      return await delegate.findMany({
        where: { agent },
        orderBy: { createdAt: 'desc' },
        take: Math.min(100, Math.max(1, take)),
      });
    } catch (err) {
      if (isMissingRelation(err)) return [];
      this.logger.warn(
        { errorName: err instanceof Error ? err.name : undefined },
        'AI audit log read failed',
      );
      return [];
    }
  }

  private warnMissing() {
    if (this.warnedMissing) return;
    this.warnedMissing = true;
    this.logger.warn(
      {},
      'AI audit log table is missing — tool attempts are not stored until the migration is applied',
    );
  }
}
