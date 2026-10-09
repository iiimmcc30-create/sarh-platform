import type { FaqCategory } from '@/services/support';

/**
 * Help-center hub — pure helpers (no React) so they stay unit-testable.
 * Sarh is a livestock marketplace: help content covers Sarh features only.
 */

/** Hub sections, top to bottom. «بلاغاتي» is intentionally absent: no my-reports endpoint yet. */
export const HELP_HUB_SECTIONS = [
  'status',
  'search',
  'categories',
  'top',
  'fraud',
  'assistant',
  'tickets',
  'createTicket',
] as const;

export type HelpHubSection = (typeof HELP_HUB_SECTIONS)[number];

/** Display order mirrors the backend FAQ_CATEGORIES order. */
export const HELP_CATEGORY_ORDER: FaqCategory[] = [
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
];

export const HELP_CATEGORY_ICON: Record<FaqCategory, string> = {
  ACCOUNT: 'person-outline',
  ADS: 'megaphone-outline',
  PROMOTION: 'rocket-outline',
  SUBSCRIPTIONS: 'crown-outline',
  VERIFICATION: 'verified',
  COUNCILS: 'mic',
  COMMUNITY: 'chatbubbles-outline',
  MARKET: 'search-outline',
  BUY_SELL: 'storefront-outline',
  SAFETY: 'shield-check-outline',
  PAYMENT: 'card-outline',
  TECHNICAL: 'construct',
  GENERAL: 'help-circle-outline',
};

export const HELP_TOP_QUESTIONS_LIMIT = 6;
export const HELP_SEARCH_MIN_CHARS = 2;
export const HELP_SEARCH_DEBOUNCE_MS = 300;

export function isHelpSearchReady(query: string): boolean {
  return query.trim().length >= HELP_SEARCH_MIN_CHARS;
}

/**
 * FAQ action buttons only navigate inside the app. Rejects external URLs,
 * protocol-relative paths and anything with whitespace / odd characters.
 */
export function isSafeHelpRoute(route: string | null | undefined): route is string {
  if (!route || typeof route !== 'string') return false;
  if (route.length > 200) return false;
  if (!route.startsWith('/') || route.startsWith('//')) return false;
  return /^\/[A-Za-z0-9_\-/()[\]?=&.]*$/.test(route);
}

export function isFaqCategory(value: unknown): value is FaqCategory {
  return typeof value === 'string' && (HELP_CATEGORY_ORDER as string[]).includes(value);
}

// ── Fraud report ─────────────────────────────────────────────────────────────

export const FRAUD_SAFETY_TIPS: string[] = [
  'لا تحوّل عربون أو مبلغ قبل ما تشوف الحلال بنفسك.',
  'خلك داخل محادثات سرح، ولا تنتقل لروابط أو أرقام غريبة.',
  'سرح ما يطلب منك رمز التحقق أو كلمة المرور أبداً.',
  'إذا انسرق منك مبلغ، بلّغ البنك فوراً وبعدها بلّغنا هنا.',
];

export const FRAUD_DETAILS_MIN = 10;

export function fraudReportError(details: string): string | null {
  const t = details.trim();
  if (!t) return 'اكتب وش صار بالتفصيل.';
  if (t.length < FRAUD_DETAILS_MIN) return 'أضف تفاصيل أكثر عشان نقدر نتابع البلاغ.';
  return null;
}

export function buildFraudReportDescription(input: { target?: string; details: string }): string {
  const target = (input.target ?? '').trim();
  const details = input.details.trim();
  return target ? `الحساب أو الإعلان المبلَّغ عنه: ${target}\n\n${details}` : details;
}

// ── Contact form → ticket ────────────────────────────────────────────────────

export const CONTACT_MESSAGE_MIN = 10;

export function contactMessageError(input: { name: string; message: string }): string | null {
  if (!input.name.trim()) return 'اكتب اسمك.';
  if (input.message.trim().length < CONTACT_MESSAGE_MIN) return 'اكتب رسالتك (10 أحرف على الأقل).';
  return null;
}

export function contactTicketPayload(input: { name: string; message: string }) {
  return {
    category: 'OTHER' as const,
    subject: `رسالة من ${input.name.trim()}`.slice(0, 120),
    description: input.message.trim(),
  };
}
