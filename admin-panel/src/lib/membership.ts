/**
 * Verification badge + subscription summary returned by the admin users
 * endpoints (`membership` on GET /admin/users and GET /admin/users/:id).
 */
export type BadgeTier = 'blue' | 'gold';

export type AdminMembership = {
  badge: { visible: boolean; tier: BadgeTier | null; legacy: boolean };
  verification: {
    state: 'not_started' | 'pending_review' | 'needs_amendments' | 'approved' | 'rejected';
    requestStatus: string | null;
    requestedTier: BadgeTier | null;
    approvedTier: BadgeTier | null;
    submittedAt: string | null;
    reviewedAt: string | null;
  };
  subscription: {
    planId: string;
    planName: string | null;
    monthlyPrice: number | null;
    currency: string | null;
    state: 'none' | 'active' | 'canceled' | 'grace_period' | 'expired';
    lifecycle: string;
    tier: BadgeTier | null;
    startedAt: string | null;
    renewDate: string | null;
    renewalIntent: boolean;
  };
};

export type Tone = 'default' | 'success' | 'warning' | 'danger' | 'info';

export const BADGE_TIER_LABEL: Record<BadgeTier, string> = {
  blue: 'Blue Badge · الشارة الزرقاء',
  gold: 'Gold Badge · الشارة الذهبية',
};

export function tierLabel(tier: BadgeTier | null | undefined): string {
  return tier ? BADGE_TIER_LABEL[tier] : '—';
}

export const VERIFICATION_STATE_LABEL: Record<AdminMembership['verification']['state'], string> = {
  not_started: 'لم يبدأ',
  pending_review: 'قيد المراجعة',
  needs_amendments: 'يحتاج تعديلات',
  approved: 'مقبول',
  rejected: 'مرفوض',
};

export const VERIFICATION_STATE_TONE: Record<AdminMembership['verification']['state'], Tone> = {
  not_started: 'default',
  pending_review: 'warning',
  needs_amendments: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const LIFECYCLE_LABEL: Record<string, string> = {
  active: 'نشط',
  cancelled: 'ملغى (حتى نهاية الفترة)',
  grace_period: 'فترة سماح',
  expired: 'منتهٍ',
  free: 'مجاني',
};

const STATE_LABEL: Record<AdminMembership['subscription']['state'], string> = {
  none: 'لا يوجد',
  active: 'نشط',
  canceled: 'ملغى (حتى نهاية الفترة)',
  grace_period: 'فترة سماح',
  expired: 'منتهٍ',
};

const STATE_TONE: Record<AdminMembership['subscription']['state'], Tone> = {
  none: 'default',
  active: 'success',
  canceled: 'warning',
  grace_period: 'warning',
  expired: 'danger',
};

/** Subscription status label: badge-plan state, else generic lifecycle. */
export function subscriptionStatus(m: AdminMembership | undefined): { label: string; tone: Tone } {
  if (!m) return { label: '—', tone: 'default' };
  const s = m.subscription;
  if (s.tier || s.state !== 'none') return { label: STATE_LABEL[s.state], tone: STATE_TONE[s.state] };
  const label = LIFECYCLE_LABEL[s.lifecycle] ?? s.lifecycle;
  return { label, tone: s.lifecycle === 'active' ? 'success' : s.lifecycle === 'free' ? 'default' : 'warning' };
}

export function planLabel(m: AdminMembership | undefined): string {
  if (!m) return '—';
  const s = m.subscription;
  if (s.tier) return BADGE_TIER_LABEL[s.tier];
  return s.planName ?? s.planId;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}
