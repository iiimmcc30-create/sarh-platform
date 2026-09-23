import { API_BASE } from '@/services/api';
import { boostPlansFromCatalog } from '@/services/promoteCatalog';

export type BoostTypeKey = 'pinned' | 'featured' | 'promotion';

export type BoostPlanOption = {
  durationDays: number;
  amount: number;
  labelAr: string;
};

export type BoostPlansMap = Record<'pinned' | 'featured' | 'both', BoostPlanOption[]>;

/** UI service order — promotion is independent from pin/feature. */
export const SERVICE_TYPE_ORDER: BoostTypeKey[] = ['pinned', 'featured', 'promotion'];

export const BOOST_TYPE_META: Record<
  BoostTypeKey,
  {
    icon: string;
    emoji: string;
    title: string;
    desc: string;
    accent: 'gold' | 'electric' | 'promotion';
  }
> = {
  pinned: {
    icon: 'pin',
    emoji: '📌',
    title: 'تثبيت الإعلان',
    desc: 'يظهر في أعلى قائمة الإعلانات',
    accent: 'electric',
  },
  featured: {
    icon: 'star',
    emoji: '⭐',
    title: 'تمييز الإعلان',
    desc: 'شارة مميزة في نتائج البحث',
    accent: 'gold',
  },
  promotion: {
    icon: 'rocket-outline',
    emoji: '🚀',
    title: 'روّج إعلانك',
    desc: 'زد وصول إعلانك ليظهر في أماكن متعددة داخل التطبيق ويحقق مشاهدات أكثر.',
    accent: 'promotion',
  },
};

/** Fallback plans when the plans API is unreachable — official catalog. */
export const FALLBACK_BOOST_PLANS: BoostPlansMap = boostPlansFromCatalog();

function normalizePlans(raw: unknown): BoostPlansMap {
  const base = { ...FALLBACK_BOOST_PLANS };
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, unknown>;
  for (const key of ['pinned', 'featured', 'both'] as const) {
    const rows = obj[key];
    if (!Array.isArray(rows)) continue;
    const mapped = rows
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        const durationDays = Number(r.durationDays);
        const amount = Number(r.amount);
        const labelAr = typeof r.labelAr === 'string' ? r.labelAr : '';
        if (!durationDays || !amount) return null;
        return { durationDays, amount, labelAr };
      })
      .filter(Boolean) as BoostPlanOption[];
    if (mapped.length > 0) base[key] = mapped;
  }
  return base;
}

export async function fetchBoostPlans(): Promise<BoostPlansMap> {
  try {
    const res = await fetch(`${API_BASE}/api/listings/boost/plans`);
    if (!res.ok) return FALLBACK_BOOST_PLANS;
    const json = await res.json();
    if (!json.success || !json.data) return FALLBACK_BOOST_PLANS;
    return normalizePlans(json.data);
  } catch {
    return FALLBACK_BOOST_PLANS;
  }
}

export function boostTypeLabel(type: BoostTypeKey): string {
  return BOOST_TYPE_META[type]?.title ?? type;
}

export function formatBoostExpiry(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function boostSuccessMessage(boostType: string, expiresAt?: string): string {
  const expiry = expiresAt ? formatBoostExpiry(expiresAt) : '';
  if (boostType === 'promotion') {
    return expiry
      ? `تم تفعيل ترويج إعلانك بنجاح حتى ${expiry}.`
      : 'تم تفعيل ترويج إعلانك بنجاح.';
  }
  if (boostType === 'both') {
    return expiry
      ? `تم تثبيت وتمييز إعلانك بنجاح حتى ${expiry}.`
      : 'تم تثبيت وتمييز إعلانك بنجاح.';
  }
  if (boostType === 'featured') {
    return expiry
      ? `تم تمييز إعلانك بنجاح حتى ${expiry}.`
      : 'تم تمييز إعلانك بنجاح.';
  }
  return expiry
    ? `تم تثبيت إعلانك بنجاح حتى ${expiry}.`
    : 'تم تثبيت إعلانك بنجاح.';
}

export function getServiceTypeOrder(): BoostTypeKey[] {
  const order = SERVICE_TYPE_ORDER ?? BOOST_TYPE_ORDER;
  if (Array.isArray(order) && order.length > 0) return order;
  return ['pinned', 'featured', 'promotion'];
}

export function getServiceMeta(key: BoostTypeKey) {
  return BOOST_TYPE_META?.[key] ?? null;
}

export function getServiceFallbackMinPlan(
  key: BoostTypeKey,
  promotionPlans?: BoostPlanOption[] | null,
): BoostPlanOption | null {
  if (key === 'promotion') {
    const plans = Array.isArray(promotionPlans) ? promotionPlans : [];
    return plans[0] ?? null;
  }
  if (key === 'pinned' || key === 'featured') {
    const plans = FALLBACK_BOOST_PLANS[key];
    return Array.isArray(plans) ? (plans[0] ?? null) : null;
  }
  return null;
}

/** @deprecated use SERVICE_TYPE_ORDER */
export const BOOST_TYPE_ORDER = SERVICE_TYPE_ORDER;
