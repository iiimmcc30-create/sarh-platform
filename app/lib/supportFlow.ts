import {
  TICKET_CATEGORY_LABEL_AR,
  type SupportTicketCategory,
  type SupportTicketStatus,
} from '@/services/support';

export type SupportFlowHelpKind = 'ORDER_HELP' | 'OTHER_HELP';

export type SupportFlowChoice = {
  id: string;
  helpKind: SupportFlowHelpKind;
  category: SupportTicketCategory;
  label: string;
  needsOrder: boolean;
};

/**
 * User-facing choices mapped 1:1 onto existing ticket categories / help kinds.
 * Do not invent backend taxonomy here.
 */
export const SUPPORT_FLOW_CHOICES: SupportFlowChoice[] = [
  {
    id: 'ORDER_HELP',
    helpKind: 'ORDER_HELP',
    category: 'ORDER_HELP',
    label: TICKET_CATEGORY_LABEL_AR.ORDER_HELP,
    needsOrder: true,
  },
  {
    id: 'ACCOUNT',
    helpKind: 'OTHER_HELP',
    category: 'ACCOUNT',
    label: 'مشكلة في حسابي',
    needsOrder: false,
  },
  {
    id: 'ADS',
    helpKind: 'OTHER_HELP',
    category: 'ADS',
    label: 'مشكلة في إعلان',
    needsOrder: false,
  },
  {
    id: 'BUY_SELL',
    helpKind: 'OTHER_HELP',
    category: 'BUY_SELL',
    label: 'مشكلة في معاملة',
    needsOrder: false,
  },
  {
    id: 'PAYMENT',
    helpKind: 'OTHER_HELP',
    category: 'PAYMENT',
    label: TICKET_CATEGORY_LABEL_AR.PAYMENT,
    needsOrder: false,
  },
  {
    id: 'BUTCHERS',
    helpKind: 'OTHER_HELP',
    category: 'BUTCHERS',
    label: TICKET_CATEGORY_LABEL_AR.BUTCHERS,
    needsOrder: false,
  },
  {
    id: 'TECHNICAL',
    helpKind: 'OTHER_HELP',
    category: 'TECHNICAL',
    label: TICKET_CATEGORY_LABEL_AR.TECHNICAL,
    needsOrder: false,
  },
  {
    id: 'OTHER',
    helpKind: 'OTHER_HELP',
    category: 'OTHER',
    label: TICKET_CATEGORY_LABEL_AR.OTHER_HELP,
    needsOrder: false,
  },
];

export const SUPPORT_DESCRIPTION_MIN = 3;

export function findSupportFlowChoice(id: string | undefined): SupportFlowChoice | undefined {
  if (!id) return undefined;
  return SUPPORT_FLOW_CHOICES.find((c) => c.id === id);
}

export function isSupportDescriptionValid(text: string): boolean {
  return text.trim().length >= SUPPORT_DESCRIPTION_MIN;
}

export function supportDescriptionError(text: string): string | null {
  if (!text.trim()) return 'اكتب وصف المشكلة قبل الإرسال.';
  if (text.trim().length < SUPPORT_DESCRIPTION_MIN) {
    return 'الوصف قصير جداً. أضف تفاصيل أوضح.';
  }
  return null;
}

/** Friendly copy — never expose internal ticket machine names. */
export function userFacingTicketStatus(status: SupportTicketStatus): string {
  switch (status) {
    case 'WAITING_FOR_CUSTOMER':
    case 'AWAITING_USER':
      return 'نحتاج بعض التفاصيل الإضافية';
    case 'WAITING_FOR_SUPPORT':
      return 'تم تحويل طلبك للفريق المختص';
    case 'IN_PROGRESS':
      return 'تم الرد على طلبك';
    case 'RESOLVED':
      return 'تم حل المشكلة';
    case 'CLOSED':
      return 'أُغلق الطلب';
    case 'OPEN':
    case 'IN_REVIEW':
    case 'AI_ASSISTING':
    default:
      return 'تم استلام طلبك';
  }
}

export function greetingFirstName(
  arabicName?: string | null,
  displayName?: string | null,
): string {
  const source = (arabicName || displayName || '').trim();
  const token = source.split(/\s+/).find((part) => part.length > 0);
  return token || '';
}
