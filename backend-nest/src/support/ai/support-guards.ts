import type { SupportIssueType } from '../constants/support.constants';

/** Shared intent rules for «مساعد سرح» (heuristic + OpenAI post-checks). */

export const JAILBREAK_RE =
  /تجاهل (كل )?(التعليمات|تعليمات)|ignore (all |the )?(previous )?instructions|system prompt|أعطني بيانات مستخدم|اعطني بيانات مستخدم|refund now|نفذ (refund|استرجاع)|api key|password of/i;

export const HUMAN_REQUEST_RE =
  /موظف|خدمة العملاء|خدمه العملاء|إنسان|انسان|بشري|شخص حقيقي|human|agent|مو بوت|مش بوت|ما ابي بوت|ابي احد يكلمني|حولني/i;

export const FRAUD_RE = /احتيال|نصب|نصاب|محتال|سرقوني|سرقة|انسرق|حرامي|scam/i;

export const REFUND_RE =
  /استرجاع|استرجع|استرداد|ارجاع (المبلغ|فلوس)|رجعوا? (لي )?(فلوسي|المبلغ)|تعويض|refund|خصم مرتين|انخصم مرتين|مدفوع مرتين|دفعت مرتين/i;

export const PAYMENT_DISPUTE_RE =
  /انخصم|خصم مني|دفعت وما|الدفع (فشل|ما زبط)|charge/i;

export const THANKS_RE =
  /^(شكرا|شكراً|مشكور|مشكورين|يعطيك العافيه|يعطيك العافية|تمام|تم|انحلت|حليتها|ok|thanks)[\s!.؟?]*$/i;

export function issueTypeForFaqKey(
  key: string | null | undefined,
): SupportIssueType {
  const k = key ?? '';
  if (k.startsWith('acc-')) return 'ACCOUNT_ISSUE';
  if (k.startsWith('ads-') || k.startsWith('mkt-') || k.startsWith('bs-')) {
    return 'LISTING_ISSUE';
  }
  if (k.startsWith('promo-')) return 'PROMOTION_ISSUE';
  if (k.startsWith('sub-') || k.startsWith('ver-')) return 'SUBSCRIPTION_ISSUE';
  if (k.startsWith('council-')) return 'COUNCIL_ISSUE';
  if (k === 'pay-refund-request' || k === 'pay-refund-policy')
    return 'REFUND_ISSUE';
  if (k.startsWith('pay-')) return 'PAYMENT_ISSUE';
  if (
    k === 'safe-scammed' ||
    k === 'safe-deposit' ||
    k === 'safe-fraud-signs'
  ) {
    return 'FRAUD_REPORT';
  }
  if (k.startsWith('tech-')) return 'TECHNICAL_ISSUE';
  return 'OTHER';
}

/** Short refund info used when the knowledge base has no refund entry. */
export const REFUND_INFO_FALLBACK_AR =
  'الاسترداد يراجعه فريق خدمة العملاء حسب سياسة الاسترداد (مثل الخصم المزدوج أو عدم تفعيل الخدمة خلال 24 ساعة). ما أقدر أنفّذ أي استرداد بنفسي.';

export const FRAUD_INFO_FALLBACK_AR =
  'لا تحوّل أي مبلغ إضافي، واحتفظ بصور المحادثة ورقم التحويل، وكلّم بنكك فوراً. بلاغك يوصل لفريق الأمان.';
