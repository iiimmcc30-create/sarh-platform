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
    title: 'تعزيز الإعلان',
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

/* ─── Boost screen redesign helpers (display only; billing stays server-side) ── */

/** Western digits with at most one decimal, e.g. 8.3 — never rounds up a price. */
function formatPerDay(value: number): string {
  const floored = Math.floor(value * 10) / 10;
  return Number.isInteger(floored) ? String(floored) : floored.toFixed(1);
}

export type PromotePlanSource = {
  durationDays: number;
  durationHours: number;
  amount: number;
  labelAr: string;
};

export type PromotePlanView = {
  durationHours: number;
  durationDays: number;
  amount: number;
  labelAr: string;
  /** "25 ر.س" */
  priceLabel: string;
  /** "≈ 8.3 ر.س لليوم" — only for multi-day packages. */
  perDayLabel: string | null;
  /** "وفّر 2 ر.س" vs buying the 1-day package repeatedly; null when no saving. */
  savingLabel: string | null;
  /** Lowest per-day price among packages with a real saving (derived, not a popularity claim). */
  bestValue: boolean;
};

/**
 * Plan cards for one service, straight from the official catalog rows.
 * Per-day price and saving are pure arithmetic on catalog amounts.
 */
export function buildPromotePlans(options: readonly PromotePlanSource[]): PromotePlanView[] {
  const oneDay = options.find((o) => o.durationDays === 1) ?? null;
  const rows = options.map((o) => {
    const multiDay = o.durationDays > 1;
    const saving = multiDay && oneDay ? oneDay.amount * o.durationDays - o.amount : 0;
    return {
      durationHours: o.durationHours,
      durationDays: o.durationDays,
      amount: o.amount,
      labelAr: o.labelAr,
      priceLabel: formatSar(o.amount),
      perDayLabel: multiDay ? `≈ ${formatPerDay(o.amount / o.durationDays)} ر.س لليوم` : null,
      savingLabel: saving > 0 ? `وفّر ${formatSar(saving)}` : null,
      perDay: o.amount / Math.max(1, o.durationDays),
      saving,
    };
  });
  const candidates = rows.filter((r) => r.saving > 0);
  const best = candidates.length
    ? candidates.reduce((a, b) => (b.perDay < a.perDay ? b : a))
    : null;
  return rows.map(({ perDay: _perDay, saving: _saving, ...r }) => ({
    ...r,
    bestValue: best != null && r.durationHours === best.durationHours,
  }));
}

/** Badge text for the derived best-value package (cheapest per day). */
export const PROMOTE_BEST_VALUE_BADGE = 'الأوفر';

export type PromoteBenefit = { icon: string; text: string };

/**
 * What each service really does (mirrors the backend):
 * - featured → star next to the title + listing order `featured desc` (after pinned)
 * - pinned → listing order `pinned desc` (first) + pin next to the title
 * - visibility → promotionWeight raises ranking; the card looks unchanged
 * Duration comes from the selected catalog package.
 */
export const PROMOTE_BENEFITS: Readonly<Record<PromotionGoal, readonly PromoteBenefit[]>> = {
  featured: [
    { icon: 'star', text: 'نجمة مميّزة بجانب عنوان إعلانك' },
    { icon: 'trending-up-outline', text: 'يتقدّم على الإعلانات العادية في القوائم' },
  ],
  pinned: [
    { icon: 'pin', text: 'يتصدّر القائمة قبل باقي الإعلانات' },
    { icon: 'eye-outline', text: 'دبوس صغير بجانب العنوان يلفت الانتباه' },
  ],
  visibility: [
    { icon: 'rocket-outline', text: 'قوة ظهور أعلى في الترتيب والبحث' },
    { icon: 'eye-outline', text: 'شكل إعلانك يبقى كما هو' },
  ],
};

/** Shared bullets: duration of the picked package + one-time payment. */
export function promoteCommonBenefits(labelAr: string | null): PromoteBenefit[] {
  return [
    ...(labelAr ? [{ icon: 'time-outline', text: `يبقى مفعّلاً ${durationPhrase(labelAr)}` }] : []),
    { icon: 'card-outline', text: 'دفعة واحدة بدون تجديد تلقائي' },
  ];
}

export const PROMOTE_HERO_LINE = 'خلّ إعلانك أول شي يشوفونه';

/** Primary CTA label, e.g. «عزّز الآن · 25 ريال». */
export function promoteCtaLabel(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return 'عزّز الآن';
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `عزّز الآن · ${value} ريال`;
}

/** Prominent free-boost title on the boost screen. */
export function freeBoostCtaTitle(remaining: number): string {
  return `استخدم تعزيز مجاني (متبقي ${Math.max(0, Math.floor(remaining || 0))})`;
}

/** Upsell only when the server answered and the user has no free-boost perk. */
export function shouldShowFreeBoostUpsell(
  quota: { eligible: boolean } | null | undefined,
  quotaLoaded: boolean,
): boolean {
  return quotaLoaded && quota != null && quota.eligible === false;
}

export const FREE_BOOST_UPSELL_AR = 'مشتركو أزرق+ والذهبي يحصلون على تمييز مجاني كل أسبوع';

/** Real promotion stats worth showing (never zeros-as-proof). */
export function hasPromotionStats(
  stats: { impressions?: number; clicks?: number } | null | undefined,
): boolean {
  if (!stats) return false;
  return (stats.impressions ?? 0) > 0 || (stats.clicks ?? 0) > 0;
}
