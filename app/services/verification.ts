// Verification subscriptions (Blue / Blue+ / Gold).
// Status: GET /api/verification/status. Checkout: the existing Payment Core
// entry point POST /api/payments/initiate (type = subscription). Cancel: the
// existing POST /api/subscriptions/cancel. No new payment flow here.
// Gold needs a merchant document (commercial register) submitted for review
// before payment; the API rejects Gold payments without it.
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import type { InitiatedPayment } from '@/services/payments';

/** Plan tiers in display order. Blue and Blue+ show the blue badge. */
export type VerificationTierId = 'blue' | 'blue_plus' | 'gold';
/** Tier of the verification (document) review. */
export type ReviewTierId = 'blue' | 'gold';

export const VERIFICATION_TIER_ORDER: readonly VerificationTierId[] = ['blue', 'blue_plus', 'gold'];

export type VerificationPlan = {
  tier: VerificationTierId;
  slug: string;
  name: string | null;
  monthlyPrice: number;
  currency: string;
  billingCycle: 'monthly';
  /** False while the price is still the 0 placeholder (admin must set it). */
  priceConfigured: boolean;
  /** Badge colour: Blue / Blue+ = blue, Gold = gold. */
  badgeColor?: 'blue' | 'gold';
  /** Gold only: a document is required before payment. */
  documentRequired?: boolean;
  /** @deprecated same as documentRequired. */
  verificationRequired?: boolean;
  /** Active plan with a real price: can be purchased. */
  available: boolean;
  extraDailyListings: number;
  visibilityBoost: number;
  /** 1 = Blue, 2 = Blue+, 3 = Gold (highest). */
  visibilityLevel?: number;
  /** Free 24h boosts every 7 days (absent on older API builds). */
  weeklyFreeBoosts?: number;
};

/** Weekly free boosts of a tier (plan value first, then the server defaults). */
export function weeklyFreeBoostsFor(plan: VerificationPlan | undefined, tier: VerificationTierId): number {
  if (typeof plan?.weeklyFreeBoosts === 'number') return Math.max(0, Math.floor(plan.weeklyFreeBoosts));
  return tier === 'gold' ? 4 : tier === 'blue_plus' ? 2 : 0;
}

export type VerificationState =
  | 'not_started'
  | 'pending_review'
  | 'needs_amendments'
  | 'approved'
  | 'rejected';

export type VerificationSubscriptionState =
  | 'none'
  | 'active'
  | 'canceled'
  | 'grace_period'
  | 'expired';

export type GoldDocumentStatus = {
  ready: boolean;
  code: 'gold_document_required' | 'gold_document_not_submitted' | 'gold_verification_rejected' | null;
  messageAr: string | null;
};

export type VerificationStatus = {
  plans: VerificationPlan[];
  verification: {
    state: VerificationState;
    requestStatus: string | null;
    requestedTier: ReviewTierId | null;
    approvedTier: ReviewTierId | null;
    reviewReason: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
  };
  /** Gold payment gate (same rule the API enforces). */
  goldDocument?: GoldDocumentStatus;
  subscription: {
    id: string | null;
    state: VerificationSubscriptionState;
    tier: VerificationTierId | null;
    planId: string;
    renewDate: string | null;
    autoRenew: boolean;
    /** True while the current period is the free Blue+ trial (no payment). */
    isTrial?: boolean;
  };
  /** One-week free Blue+ trial (absent on older API builds). */
  trial?: FreeTrialStatus;
  badge: {
    visible: boolean;
    tier: VerificationTierId | null;
    color?: 'blue' | 'gold' | null;
    legacy: boolean;
  };
  billing: {
    cycle: 'monthly';
    automaticCharge: boolean;
    renewal: string;
    /** Where the current period is billed (absent on older API builds). */
    source?: BillingSource;
    autoRenew?: boolean;
    expiresAt?: string | null;
  };
  /** Live perk usage for the «التوثيق» hub (absent on older API builds). */
  perks?: VerificationPerks | null;
  /** «إخفاء الشارة» / «إخفاء بائع ذهبي» (absent on older API builds). */
  preferences?: BadgePreferences;
};

/** app_store / google_play: managed and cancelled in the store only. */
export type BillingSource = 'app_store' | 'google_play' | 'ngenius' | 'trial' | 'none';

export function isStoreBillingSource(source: BillingSource | null | undefined): source is 'app_store' | 'google_play' {
  return source === 'app_store' || source === 'google_play';
}

export type VerificationPerks = {
  tier: VerificationTierId | null;
  freeBoosts: { limit: number; used: number; remaining: number; nextResetAt: string | null };
  dailyListings: { limit: number; used: number; resetsAt: string | null };
  profileViews30d: { count: number; unlocked: boolean };
  prioritySupport: boolean;
  /** `canShowImages`: «عرض صورة» in councils (Gold; older servers omit it). */
  councils: { canSchedule: boolean; canFollowersOnly: boolean; canShowImages?: boolean };
};

export type BadgePreferences = {
  hideVerifiedBadge: boolean;
  hideGoldSellerLabel: boolean;
};

/**
 * Free Blue+ trial: one week, once per account that never subscribed. No
 * card, no payment, no renewal: it simply ends and the account goes back to
 * the free plan. Start: POST /api/subscriptions/trial.
 */
export type FreeTrialStatus = {
  tier: 'blue_plus';
  planSlug: string;
  durationDays: number;
  /** Can start the trial now. */
  eligible: boolean;
  /** The trial is running now. */
  active: boolean;
  /** The account already used its one trial. */
  used: boolean;
  startedAt: string | null;
  endsAt: string | null;
  daysLeft: number;
};

/** "تنتهي خلال 3 أيام" (Arabic plural rules for small counts). */
export function trialEndsInLabelAr(daysLeft: number): string {
  if (daysLeft <= 1) return 'تنتهي خلال يوم';
  if (daysLeft === 2) return 'تنتهي خلال يومين';
  if (daysLeft <= 10) return `تنتهي خلال ${daysLeft} أيام`;
  return `تنتهي خلال ${daysLeft} يوماً`;
}

/** Status line while the trial runs: "تجربة مجانية — تنتهي خلال X أيام". */
export function trialStatusLabelAr(trial: Pick<FreeTrialStatus, 'daysLeft'>): string {
  return `تجربة مجانية — ${trialEndsInLabelAr(trial.daysLeft)}`;
}

/** Share of the trial already used (0..1), for the progress track. */
export function trialElapsedRatio(
  trial: Pick<FreeTrialStatus, 'startedAt' | 'endsAt'>,
  now: number = Date.now(),
): number {
  const start = trial.startedAt ? new Date(trial.startedAt).getTime() : NaN;
  const end = trial.endsAt ? new Date(trial.endsAt).getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

/** Only Gold is gold; Blue, Blue+ (and legacy) are blue. */
export function badgeColorOf(tier: unknown): 'blue' | 'gold' {
  return tier === 'gold' ? 'gold' : 'blue';
}

export function tierRank(tier: VerificationTierId | null | undefined): number {
  return tier ? VERIFICATION_TIER_ORDER.indexOf(tier) : -1;
}

/** Product copy per tier (numbers come from the plan when available). */
export const VERIFICATION_TIER_COPY: Record<
  VerificationTierId,
  {
    label: string;
    name: string;
    audience: string;
    visibility: string;
    visibilityShort: string;
    defaultExtraDaily: number;
    defaultVisibilityLevel: number;
  }
> = {
  blue: {
    label: 'Blue',
    name: 'الشارة الزرقاء',
    audience: 'للأفراد والبائعين',
    visibility: 'ظهور أعلى من الحساب العادي',
    visibilityShort: 'مرتفعة',
    defaultExtraDaily: 3,
    defaultVisibilityLevel: 1,
  },
  blue_plus: {
    label: 'Blue+',
    name: 'Blue+ الشارة الزرقاء',
    audience: 'للمستخدمين النشطين',
    visibility: 'أولوية ظهور أعلى من Blue',
    visibilityShort: 'أعلى',
    defaultExtraDaily: 6,
    defaultVisibilityLevel: 2,
  },
  gold: {
    label: 'Gold',
    name: 'الشارة الذهبية',
    audience: 'للتجار والبائعين المحترفين',
    visibility: 'أعلى أولوية ظهور',
    visibilityShort: 'الأعلى',
    defaultExtraDaily: 10,
    defaultVisibilityLevel: 3,
  },
};

export const VERIFICATION_STATE_LABEL_AR: Record<VerificationState, string> = {
  not_started: 'لم يبدأ',
  pending_review: 'قيد المراجعة',
  needs_amendments: 'يحتاج تعديلاً',
  approved: 'مقبول',
  rejected: 'مرفوض',
};

export function formatArabicDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function subscriptionStateLabelAr(
  sub: Pick<VerificationStatus['subscription'], 'state' | 'renewDate'>,
): string {
  const date = formatArabicDate(sub.renewDate);
  switch (sub.state) {
    case 'active':
      return date ? `فعّال حتى ${date} · تجديد يدوي` : 'فعّال';
    case 'canceled':
      return date ? `ملغى · فعّال حتى ${date}` : 'ملغى';
    case 'grace_period':
      return 'فترة سماح · جدّد للحفاظ على المزايا';
    case 'expired':
      return date ? `منتهي منذ ${date}` : 'منتهي';
    default:
      return 'غير مشترك';
  }
}

export function extraDailyFor(plan: VerificationPlan | undefined, tier: VerificationTierId): number {
  return plan?.extraDailyListings ?? VERIFICATION_TIER_COPY[tier].defaultExtraDaily;
}

export function visibilityLevelFor(plan: VerificationPlan | undefined, tier: VerificationTierId): number {
  return plan?.visibilityLevel ?? VERIFICATION_TIER_COPY[tier].defaultVisibilityLevel;
}

/** Gold only: document required before payment (API value, Gold by default). */
export function documentRequiredFor(plan: VerificationPlan | undefined, tier: VerificationTierId): boolean {
  return plan?.documentRequired ?? plan?.verificationRequired ?? tier === 'gold';
}

export async function fetchVerificationStatus(): Promise<VerificationStatus | null> {
  try {
    const res = await authFetch(`${API_BASE}/api/verification/status`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) return null;
    return json.data as VerificationStatus;
  } catch {
    return null;
  }
}

export async function fetchVerificationPlans(): Promise<VerificationPlan[]> {
  try {
    const res = await authFetch(`${API_BASE}/api/verification/plans`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) return [];
    return (json.data?.plans ?? []) as VerificationPlan[];
  } catch {
    return [];
  }
}

/** First monthly charge through the existing Payment Core checkout. */
export async function initiateVerificationSubscription(params: {
  plan: VerificationPlan;
  subscriptionId: string;
  method?: string;
}): Promise<InitiatedPayment & { ok: boolean; error?: string; code?: string }> {
  const { plan, subscriptionId, method = 'mada' } = params;
  const copy = VERIFICATION_TIER_COPY[plan.tier];
  try {
    const res = await authFetch(`${API_BASE}/api/payments/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: plan.monthlyPrice,
        currency: plan.currency || 'SAR',
        method,
        type: 'subscription',
        referenceId: subscriptionId,
        planId: plan.slug,
        billingCycle: 'monthly',
        description: `sarh ${plan.slug} verification subscription - monthly`,
        descriptionAr: `اشتراك توثيق سرح — ${copy.name} (شهري)`,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      return {
        ok: false,
        error: json.messageAr ?? json.message ?? 'تعذّر بدء عملية الدفع',
        code: typeof json.error === 'string' ? json.error : undefined,
      };
    }
    const data = (json.data ?? {}) as InitiatedPayment;
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: 'تعذّر الاتصال بالخادم' };
  }
}

/**
 * Stops the next renewal; benefits stay until the paid period ends. Store
 * subscriptions are refused by the API with `manage_in_store` (cancel them in
 * App Store / Google Play).
 */
export async function cancelVerificationSubscription(): Promise<{ ok: boolean; error?: string; code?: string }> {
  try {
    const res = await authFetch(`${API_BASE}/api/subscriptions/cancel`, { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      return {
        ok: false,
        code: typeof json.error === 'string' ? json.error : undefined,
        error: json.messageAr ?? json.message ?? 'تعذّر إلغاء التجديد',
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'تعذّر الاتصال بالخادم' };
  }
}

/** Trial eligibility / state (signed-in users only). */
export async function fetchFreeTrial(): Promise<FreeTrialStatus | null> {
  try {
    const res = await authFetch(`${API_BASE}/api/subscriptions/trial`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) return null;
    return json.data as FreeTrialStatus;
  } catch {
    return null;
  }
}

/** Starts the one-week free Blue+ trial. No card and no payment. */
export async function startFreeTrial(): Promise<{
  ok: boolean;
  trial?: FreeTrialStatus;
  error?: string;
  code?: string;
}> {
  try {
    const res = await authFetch(`${API_BASE}/api/subscriptions/trial`, { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      return {
        ok: false,
        error: json.messageAr ?? json.message ?? 'تعذّر بدء التجربة المجانية',
        code: typeof json.error === 'string' ? json.error : undefined,
      };
    }
    return { ok: true, trial: json.data?.trial as FreeTrialStatus | undefined };
  } catch {
    return { ok: false, error: 'تعذّر الاتصال بالخادم' };
  }
}

/** Saves «إخفاء الشارة» / «إخفاء بائع ذهبي»; returns the stored values or null. */
export async function updateBadgePreferences(
  patch: Partial<BadgePreferences>,
): Promise<BadgePreferences | null> {
  try {
    const res = await authFetch(`${API_BASE}/api/verification/preferences`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success || !json.data) return null;
    return {
      hideVerifiedBadge: json.data.hideVerifiedBadge === true,
      hideGoldSellerLabel: json.data.hideGoldSellerLabel === true,
    };
  } catch {
    return null;
  }
}
