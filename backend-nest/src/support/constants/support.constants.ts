export const SUPPORT_TICKET_CATEGORIES = [
  'ACCOUNT',
  'ADS',
  'MARKET',
  'BUY_SELL',
  'PAYMENT',
  'VERIFICATION',
  'BUTCHERS',
  'TECHNICAL',
  'OTHER',
  'ORDER_HELP',
  'OTHER_HELP',
] as const;

export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];

export const HELP_KINDS = ['ORDER_HELP', 'OTHER_HELP'] as const;
export type HelpKind = (typeof HELP_KINDS)[number];

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

export const SUPPORT_TICKET_CATEGORY_LABEL_AR: Record<
  SupportTicketCategory,
  string
> = {
  ACCOUNT: 'الحساب',
  ADS: 'الإعلانات',
  MARKET: 'السوق',
  BUY_SELL: 'البيع والشراء',
  PAYMENT: 'الدفع',
  VERIFICATION: 'التوثيق',
  BUTCHERS: 'الملاحم',
  TECHNICAL: 'المشاكل التقنية',
  OTHER: 'أخرى',
  ORDER_HELP: 'مشكلة في الطلب',
  OTHER_HELP: 'مساعدة في شيء آخر',
};

export const TICKET_STATUS_LABEL_AR: Record<string, string> = {
  OPEN: 'جديدة',
  IN_REVIEW: 'قيد المراجعة',
  AI_ASSISTING: 'سرحان يساعد',
  WAITING_FOR_CUSTOMER: 'بانتظار العميل',
  WAITING_FOR_SUPPORT: 'بانتظار خدمة العملاء',
  IN_PROGRESS: 'قيد المعالجة',
  AWAITING_USER: 'بانتظار رد المستخدم',
  RESOLVED: 'تم الحل',
  CLOSED: 'مغلقة',
};

export const VERIFICATION_STATUS_LABEL_AR: Record<string, string> = {
  DRAFT: 'لم يتم التقديم',
  UNDER_REVIEW: 'قيد المراجعة',
  NEEDS_AMENDMENTS: 'يحتاج تعديلات',
  VERIFIED: 'موثق',
  REJECTED: 'مرفوض',
};

export const FAQ_CATEGORY_LABEL_AR: Record<string, string> = {
  ACCOUNT: 'الحساب',
  ADS: 'الإعلانات',
  MARKET: 'السوق',
  BUY_SELL: 'البيع والشراء',
  PAYMENT: 'الدفع',
  VERIFICATION: 'التوثيق',
  BUTCHERS: 'الملاحم',
  TECHNICAL: 'المشاكل التقنية',
  GENERAL: 'عام',
};

export const ADMIN_TICKET_STATUS_GROUPS = {
  open: [
    'OPEN',
    'IN_REVIEW',
    'AI_ASSISTING',
    'WAITING_FOR_CUSTOMER',
    'AWAITING_USER',
  ],
  waiting_support: ['WAITING_FOR_SUPPORT'],
  in_progress: ['IN_PROGRESS'],
  resolved: ['RESOLVED'],
  closed: ['CLOSED'],
} as const;

export function firstNameFromUser(user: {
  arabicName?: string | null;
  displayName?: string | null;
}): string {
  const source = (user.arabicName || user.displayName || '').trim();
  const token = source.split(/\s+/).find((part) => part.length > 0);
  return (token || 'عميل').slice(0, 40);
}

export function sarhanWelcome(firstName: string, topicLabel?: string): string {
  const topic = topicLabel ? ` بخصوص ${topicLabel}` : '';
  return `مرحباً ${firstName}، أنا سرحان من فريق الدعم. اطلعت على تفاصيل طلبك${topic} وأراجع المعلومات التي أرسلتها.`;
}

export function sarhanHandoff(_ticketNumber?: string): string {
  return 'شكرًا لك، اكتملت المعلومات اللازمة. تم تحويل طلبك إلى الفريق المختص.\nيرجى البقاء في المحادثة لمتابعة الرد.';
}
