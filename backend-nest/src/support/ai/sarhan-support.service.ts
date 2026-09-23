import { Inject, Injectable } from '@nestjs/common';
import { LoggerService } from '../../common/services/logger.service';
import { sarhanHandoff } from '../constants/support.constants';
import {
  AI_PROVIDER,
  type AiProvider,
  type SarhanDecision,
  type SupportAiContext,
} from './ai-provider';

const SENSITIVE_META = /password|token|secret|api[_-]?key|fcm|authorization/i;

export type SarhanTurnResult = {
  replyAr: string;
  escalate: boolean;
  issueType?: string;
  summary?: string;
  missingInformation: string[];
  metadata: Record<string, unknown>;
};

function sanitizeMeta(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!input) return out;
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_META.test(key)) continue;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = typeof value === 'string' ? value.slice(0, 200) : value;
    }
  }
  return out;
}

@Injectable()
export class SarhanSupportService {
  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly logger: LoggerService,
  ) {}

  async nextTurn(
    context: SupportAiContext,
    existingMeta: Record<string, unknown>,
  ): Promise<SarhanTurnResult> {
    const decision: SarhanDecision = await this.ai.completeSupportTurn(context);
    const patch = sanitizeMeta(decision.metadataPatch);
    const metadata = {
      ...existingMeta,
      ...patch,
      issueType: decision.issueType ?? existingMeta.issueType ?? 'OTHER',
      summary: decision.summary ?? existingMeta.summary ?? null,
      customerDescription: context.customerDescription,
      missingInformation: decision.missingInformation ?? [],
      orderContext: context.order
        ? {
            orderId: context.order.orderId,
            status: context.order.status,
            paymentStatus: context.order.paymentStatus,
            totalPrice: context.order.totalPrice,
          }
        : (existingMeta.orderContext ?? null),
    };

    this.logger.info(
      {
        event: decision.escalate ? 'AI_ESCALATED' : 'AI_TURN',
        ticketNumber: context.ticketNumber,
        issueType: metadata.issueType,
      },
      'Sarhan support turn',
    );

    const replyAr = decision.escalate
      ? sarhanHandoff(context.ticketNumber)
      : decision.replyAr;

    return {
      replyAr,
      escalate: decision.escalate,
      issueType: String(metadata.issueType),
      summary:
        typeof metadata.summary === 'string' ? metadata.summary : undefined,
      missingInformation: Array.isArray(metadata.missingInformation)
        ? metadata.missingInformation.map(String)
        : [],
      metadata,
    };
  }
}
