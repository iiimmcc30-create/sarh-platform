import {
  SUPPORT_ISSUE_TYPES,
  type SupportIssueType,
} from '../constants/support.constants';

export { SUPPORT_ISSUE_TYPES };
export type { SupportIssueType };

/** A knowledge-base FAQ retrieved for the current customer message. */
export type SupportKnowledgeSnippet = {
  key: string | null;
  questionAr: string;
  answerAr: string;
  actionRoute?: string | null;
  actionLabel?: string | null;
  /** Retrieval score 0..1. */
  score: number;
};

export type SupportAiContext = {
  ticketNumber: string;
  category: string;
  customerFirstName: string;
  customerDescription: string;
  issueType?: string | null;
  summary?: string | null;
  missingInformation: string[];
  recentMessages: Array<{ authorKind: string; body: string }>;
  /** Top FAQ matches for the latest customer message (best first). */
  knowledge: SupportKnowledgeSnippet[];
};

/** Why a turn was handed to a human (shown to staff in the alert e-mail). */
export const SUPPORT_ESCALATION_REASONS = [
  'human_requested',
  'fraud',
  'refund',
  'payment_dispute',
  'repeated',
  'low_confidence',
  'assistant_decision',
  'assistant_disabled',
] as const;
export type SupportEscalationReason =
  (typeof SUPPORT_ESCALATION_REASONS)[number];

export type SarhanDecision = {
  /**
   * Reply text. When `escalate` is true this holds only the informational
   * part (may be empty); the standard handoff line is appended by the service.
   */
  replyAr: string;
  issueType?: SupportIssueType;
  escalate: boolean;
  missingInformation?: string[];
  summary?: string;
  metadataPatch?: Record<string, unknown>;
  /** Set when `escalate` is true. */
  escalationReason?: SupportEscalationReason;
};

export interface AiProvider {
  completeSupportTurn(context: SupportAiContext): Promise<SarhanDecision>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');

/** Latest customer text (falls back to the ticket description). */
export function lastCustomerText(context: SupportAiContext): string {
  const last = [...context.recentMessages]
    .reverse()
    .find((m) => m.authorKind === 'CUSTOMER');
  return (last?.body || context.customerDescription || '').trim();
}
