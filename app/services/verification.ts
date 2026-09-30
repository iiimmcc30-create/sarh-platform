// Verification subscriptions (Blue / Gold badge).
// Status: GET /api/verification/status. Checkout: the existing Payment Core
// entry point POST /api/payments/initiate (type = subscription). Cancel: the
// existing POST /api/subscriptions/cancel. No new payment flow here.
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import type { InitiatedPayment } from '@/services/payments';

export type VerificationTierId = 'blue' | 'gold';

export type VerificationPlan = {
  tier: VerificationTierId;
  slug: string;
  name: string | null;
  monthlyPrice: number;
  currency: string;
  billingCycle: 'monthly';
  /** False while the price is still the 0 placeholder (admin must set it). */
  priceConfigured: boolean;
  /** Blue: false (subscription only). Gold: true (approved merchant verification). */
  verificationRequired?: boolean;
  /** Active plan with a real price: can be purchased. */
  available: boolean;
  extraDailyListings: number;
  visibilityBoost: number;
};

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

export type VerificationStatus = {
  plans: VerificationPlan[];
  verification: {
    state: VerificationState;
    requestStatus: string | null;
    requestedTier: VerificationTierId | null;
    approvedTier: VerificationTierId | null;
    reviewReason: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
  };
  subscription: {
    id: string | null;
    state: VerificationSubscriptionState;
    tier: VerificationTierId | null;
    planId: string;
    renewDate: string | null;
    autoRenew: boolean;
  };
  badge: { visible: boolean; tier: VerificationTierId | null; legacy: boolean };
  billing: { cycle: 'monthly'; automaticCharge: boolean; renewal: string };
};

/** Product copy per tier (benefit numbers come from the plan when available). */
export const VERIFICATION_TIER_COPY: Record<
  VerificationTierId,
  { name: string; audience: string; visibility: string; defaultExtraDaily: number }
> = {
  blue: {
    name: 'الشارة الزرقاء',
    audience: 'للأفراد والبائعين',
    visibility: 'ظهور أعلى لحسابك وإعلاناتك',
    defaultExtraDaily: 3,
  },
  gold: {
    name: 'الشارة الذهبية',
    audience: 'للتجار والبائعين المحترفين',
    visibility: 'أعلى ظهور لحسابك وإعلاناتك',
    defaultExtraDaily: 6,
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
}): Promise<InitiatedPayment & { ok: boolean; error?: string }> {
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
      return { ok: false, error: json.messageAr ?? json.message ?? 'تعذّر بدء عملية الدفع' };
    }
    const data = (json.data ?? {}) as InitiatedPayment;
    return { ok: true, ...data };
  } catch {
    return { ok: false, error: 'تعذّر الاتصال بالخادم' };
  }
}

/** Stops the next renewal; benefits stay until the paid period ends. */
export async function cancelVerificationSubscription(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await authFetch(`${API_BASE}/api/subscriptions/cancel`, { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      return { ok: false, error: json.messageAr ?? json.message ?? 'تعذّر إلغاء التجديد' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'تعذّر الاتصال بالخادم' };
  }
}
