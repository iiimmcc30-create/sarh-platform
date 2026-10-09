export const SUPPORT_TICKET_CATEGORIES = [
  'ACCOUNT',
  'ADS',
  'MARKET',
  'BUY_SELL',
  'PAYMENT',
  'VERIFICATION',
  'TECHNICAL',
  'SUBSCRIPTIONS',
  'COUNCILS',
  'FRAUD',
  'OTHER',
  'OTHER_HELP',
] as const;

export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];

export const HELP_KINDS = ['OTHER_HELP'] as const;
export type HelpKind = (typeof HELP_KINDS)[number];

/** Display name of the support assistant (user-visible everywhere). */
export const SUPPORT_ASSISTANT_NAME_AR = 'مساعد سرح';

/** Sarh (livestock marketplace) issue taxonomy used by «مساعد سرح». */
export const SUPPORT_ISSUE_TYPES = [
  'ACCOUNT_ISSUE',
  'LISTING_ISSUE',
  'PROMOTION_ISSUE',
  'SUBSCRIPTION_ISSUE',
  'PAYMENT_ISSUE',
  'REFUND_ISSUE',
  'FRAUD_REPORT',
  'COUNCIL_ISSUE',
  'TECHNICAL_ISSUE',
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
  TECHNICAL: 'المشاكل التقنية',
  SUBSCRIPTIONS: 'الاشتراكات',
  COUNCILS: 'المجالس',
  FRAUD: 'بلاغ احتيال',
  OTHER: 'أخرى',
  OTHER_HELP: 'مساعدة في شيء آخر',
};

export const TICKET_STATUS_LABEL_AR: Record<string, string> = {
  OPEN: 'جديدة',
  IN_REVIEW: 'قيد المراجعة',
  AI_ASSISTING: 'مساعد سرح يساعدك',
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

/** FAQ categories in hub display order. */
export const FAQ_CATEGORIES = [
  'ACCOUNT',
  'ADS',
  'PROMOTION',
  'SUBSCRIPTIONS',
  'VERIFICATION',
  'COUNCILS',
  'COMMUNITY',
  'MARKET',
  'BUY_SELL',
  'SAFETY',
  'PAYMENT',
  'TECHNICAL',
  'GENERAL',
] as const;

export type FaqCategoryValue = (typeof FAQ_CATEGORIES)[number];

export const FAQ_CATEGORY_LABEL_AR: Record<FaqCategoryValue, string> = {
  ACCOUNT: 'الحساب والدخول',
  ADS: 'الإعلانات',
  PROMOTION: 'التعزيز والترويج',
  SUBSCRIPTIONS: 'الاشتراكات',
  VERIFICATION: 'التوثيق',
  COUNCILS: 'المجالس',
  COMMUNITY: 'المجتمع والرسائل',
  MARKET: 'السوق والبحث',
  BUY_SELL: 'البيع والشراء',
  SAFETY: 'الأمان والبلاغات',
  PAYMENT: 'الدفع والاسترداد',
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
  return `هلا ${firstName}، معك ${SUPPORT_ASSISTANT_NAME_AR}. قرأت رسالتك${topic} وأشوف لك الجواب.`;
}

export function sarhanHandoff(_ticketNumber?: string): string {
  return 'حوّلت طلبك لفريق خدمة العملاء، وبيردون عليك هنا في نفس المحادثة.';
}

/** Default service-status line shown at the top of the help center. */
export const SERVICE_STATUS_SETTING_KEY = 'support.serviceStatus';
export const SERVICE_STATUS_DEFAULT_TEXT_AR = 'كل الخدمات تعمل بشكل طبيعي';
export const SERVICE_STATUS_STATES = ['ok', 'degraded'] as const;
export type ServiceStatusState = (typeof SERVICE_STATUS_STATES)[number];
