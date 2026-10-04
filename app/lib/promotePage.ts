/**
 * Pure helpers for the listing Promote screen (`app/listing/[id]/promote.tsx`).
 * Display + error copy only — pricing comes from the official catalog
 * (`services/promoteCatalog.ts`) and billing stays on the server.
 */
import type { PromotionGoal } from '@/services/listingPromote';

/** Short SAR label used on the promote screen, e.g. "19 ر.س". */
export function formatSar(amount: number): string {
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${value} ر.س`;
}

/** "لمدة يوم واحد" from a catalog label ("يوم واحد", "يومين", "٣ أيام"). */
export function durationPhrase(labelAr: string): string {
  return `لمدة ${labelAr}`;
}

export type PromoteServiceCopy = {
  goal: PromotionGoal;
  icon: string;
  title: string;
  /** What it is — one short line. */
  desc: string;
  /** What the seller gets — one short line. */
  outcome: string;
};

/** Copy for the three existing services (same meaning as before the redesign). */
export const PROMOTE_SERVICE_COPY: readonly PromoteServiceCopy[] = [
  {
    goal: 'featured',
    icon: 'star',
    title: 'تمييز الإعلان',
    desc: 'شارة مميزة لإعلانك',
    outcome: 'نجمة ذهبية بجانب العنوان في نتائج البحث',
  },
  {
    goal: 'pinned',
    icon: 'pin',
    title: 'تثبيت الإعلان',
    desc: 'يبقى إعلانك في الأعلى',
    outcome: 'أعلى القائمة مع دبوس صغير بجانب العنوان',
  },
  {
    goal: 'visibility',
    icon: 'rocket-outline',
    title: 'ترويج الإعلان',
    desc: 'ظهور أوسع لإعلانك',
    outcome: 'قوة ظهور أعلى في الخوارزمية بدون تغيير شكله',
  },
];

export const PROMOTE_GENERIC_ERROR_AR = 'تعذّر بدء الدفع. حاول مرة أخرى.';
export const PROMOTE_GATEWAY_ERROR_AR =
  'خدمة الدفع غير متاحة حالياً، ولم يتم خصم أي مبلغ. حاول مرة أخرى لاحقاً.';
export const PROMOTE_NETWORK_ERROR_AR = 'تعذّر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.';
export const PROMOTE_SESSION_ERROR_AR = 'انتهت الجلسة. سجّل الدخول مرة أخرى ثم أعد المحاولة.';
export const PROMOTE_CHECKOUT_FAILED_AR = 'تعذّر فتح صفحة الدفع. حاول مرة أخرى.';
export const PROMOTE_CHECKOUT_CANCELLED_AR = 'لم يكتمل الدفع. يمكنك المحاولة مرة أخرى متى شئت.';

type ErrorLike = { message?: unknown; code?: unknown; status?: unknown; name?: unknown };

/** Text that must never reach users (gateway internals, stack traces, JSON, English). */
function looksTechnical(message: string): boolean {
  return (
    !/[\u0600-\u06FF]/.test(message) ||
    /\{error\.|NI |N-Genius|ngenius|Error:|stack|at \w+ \(|https?:\/\/|\(\d{3}\)|[{}[\]]/i.test(message)
  );
}

/**
 * Friendly Arabic message for a failed `initiatePromotePayment` call.
 * Gateway / server failures (e.g. 502 payment_gateway_error from an N-Genius
 * 422 inactiveOutlet) never show the raw gateway text.
 */
export function promotePaymentErrorMessage(err: unknown): string {
  const e = (err ?? {}) as ErrorLike;
  const code = typeof e.code === 'string' ? e.code : '';
  const status = typeof e.status === 'number' ? e.status : 0;
  const message = typeof e.message === 'string' ? e.message.trim() : '';

  if (code === 'payment_gateway_error' || status >= 500) return PROMOTE_GATEWAY_ERROR_AR;
  if (status === 401 || code === 'unauthorized') return PROMOTE_SESSION_ERROR_AR;
  if (e.name === 'TypeError' || /network request failed|failed to fetch/i.test(message)) {
    return PROMOTE_NETWORK_ERROR_AR;
  }
  if (message && !looksTechnical(message)) return message;
  return PROMOTE_GENERIC_ERROR_AR;
}

/** Copy for the non-success results of `launchPaymentCheckout`. */
export function promoteCheckoutOutcomeMessage(
  outcome: 'paid' | 'opened' | 'cancelled' | 'failed',
): { tone: 'error' | 'info'; text: string } | null {
  if (outcome === 'failed') return { tone: 'error', text: PROMOTE_CHECKOUT_FAILED_AR };
  if (outcome === 'cancelled') return { tone: 'info', text: PROMOTE_CHECKOUT_CANCELLED_AR };
  return null;
}

/**
 * Single-flight guard: while one submission runs, further calls are ignored
 * (prevents double payment initiation from fast double taps).
 */
export function createSubmitGuard() {
  let busy = false;
  return {
    get busy() {
      return busy;
    },
    async run<T>(task: () => Promise<T>): Promise<T | undefined> {
      if (busy) return undefined;
      busy = true;
      try {
        return await task();
      } finally {
        busy = false;
      }
    },
  };
}
