export const SUPPORT_ISSUE_TYPES = [
  'ORDER_NOT_RECEIVED',
  'ORDER_ITEM_MISSING',
  'WRONG_ITEM',
  'DAMAGED_ITEM',
  'PAYMENT_ISSUE',
  'REFUND_ISSUE',
  'DELIVERY_ISSUE',
  'OTHER',
] as const;

export type SupportIssueType = (typeof SUPPORT_ISSUE_TYPES)[number];

export type SupportAiContext = {
  ticketNumber: string;
  category: string;
  customerFirstName: string;
  customerDescription: string;
  issueType?: string | null;
  summary?: string | null;
  missingInformation: string[];
  recentMessages: Array<{ authorKind: string; body: string }>;
};

export type SarhanDecision = {
  replyAr: string;
  issueType?: SupportIssueType;
  escalate: boolean;
  missingInformation?: string[];
  summary?: string;
  metadataPatch?: Record<string, unknown>;
};

export interface AiProvider {
  completeSupportTurn(context: SupportAiContext): Promise<SarhanDecision>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
