// API-driven subscription plan types (no hardcoded catalog)

export type PlanAudience = 'USER' | 'BUTCHER';
export type BillingCycle = 'monthly' | 'yearly';
export type PlanSlug = string;

export type PlanFeatureRow = {
  key: string;
  label: string;
  value: string | number | boolean;
  valueType: 'BOOLEAN' | 'NUMBER' | 'STRING' | 'JSON';
};

export type PlanPermissions = Record<string, boolean | number | string | unknown>;

export type SubscriptionPlan = {
  id: string;
  slug: string;
  legacyId?: string;
  name: string;
  description: string;
  audience: PlanAudience;
  monthlyPrice: number;
  yearlyPrice: number;
  price: number;
  currency: string;
  yearlyDiscount: number;
  isActive: boolean;
  sortOrder: number;
  permissions: PlanPermissions;
  displayFeatures: PlanFeatureRow[];
  features?: Array<{ key: string; value: string; valueType: string }>;
};

export const PLAN_ICONS: Record<string, string> = {
  free: 'gift-outline',
  'sarh-pro': 'diamond-outline',
  growth: 'trending-up-outline',
  'nom-pro': 'trending-up-outline',
};

export const PLAN_NAMES_AR: Record<string, string> = {
  free: 'مجاني',
  'sarh-pro': 'سرح برو',
  growth: 'نمو',
  'nom-pro': 'نمو',
};

export const PLAN_DESC_AR: Record<string, string> = {
  free: 'ابدأ التداول في سرح مجاناً',
  'sarh-pro': 'الباقة المميزة للمتداولين والمربين النشطين',
  growth: 'باقة النمو للملاحم والمتاجر الموثّقة',
  'nom-pro': 'باقة النمو للملاحم والمتاجر الموثّقة',
};

/** Plan features hidden from user-facing UI */
export const HIDDEN_PLAN_FEATURE_KEYS = new Set(['storeCommission']);

export const FEATURE_LABELS_AR: Record<string, string> = {
  maxAdsPer24Hours: 'الحد الأقصى للإعلانات يومياً',
  monthlyFeaturedAds: 'إعلانات مميزة شهرياً',
  monthlyPinnedAds: 'إعلانات مثبتة شهرياً',
  monthlyLiveHours: 'ساعات البث المباشر شهرياً',
  verifiedBadge: 'شارة التوثيق',
  prioritySupport: 'دعم أولوية',
  prioritySearch: 'أولوية في البحث',
  priorityHome: 'ظهور مميز في الصفحة الرئيسية',
  canCreateLive: 'البث المباشر',
  storeCommission: 'عمولة المتجر',
  storeEnabled: 'تفعيل المتجر',
  receiveOrders: 'استقبال الطلبات',
  analyticsDashboard: 'لوحة التحليلات',
};

export const LEGACY_SLUG_MAP: Record<string, string> = {
  starter: 'sarh-pro',
  pro: 'sarh-pro',
  vip: 'sarh-pro',
};

export function normalizeSlug(slug: string): string {
  const canonical = slug.trim().toLowerCase().replace(/[\s_]+/g, '-');
  return LEGACY_SLUG_MAP[canonical] ?? canonical;
}

export function planIcon(slug: string): string {
  return PLAN_ICONS[normalizeSlug(slug)] ?? 'pricetag-outline';
}

export function planGradientColors(sortOrder: number): [string, string] {
  return sortOrder > 0 ? ['#20B66F', '#18965B'] : ['#334155', '#1E293B'];
}

export function planDisplayName(slug: string, fallback?: string): string {
  return PLAN_NAMES_AR[normalizeSlug(slug)] ?? fallback ?? slug;
}

export function featureLabel(key: string, apiLabel?: string): string {
  return FEATURE_LABELS_AR[key] ?? apiLabel ?? key;
}

export function localizePlan(plan: SubscriptionPlan): SubscriptionPlan {
  const slug = normalizeSlug(plan.slug);
  return {
    ...plan,
    name: planDisplayName(slug, plan.name),
    description: PLAN_DESC_AR[slug] ?? plan.description,
    displayFeatures: (plan.displayFeatures ?? [])
      .filter((f) => !HIDDEN_PLAN_FEATURE_KEYS.has(f.key))
      .map((f) => ({
      ...f,
      label: featureLabel(f.key, f.label),
    })),
  };
}

export function mapApiPlan(raw: Record<string, unknown>): SubscriptionPlan {
  const slug = normalizeSlug(String(raw.slug ?? raw.legacyId ?? raw.id ?? 'free'));
  const mapped: SubscriptionPlan = {
    id: String(raw.id ?? slug),
    slug,
    legacyId: raw.legacyId ? String(raw.legacyId) : slug,
    name: String(raw.name ?? slug),
    description: String(raw.description ?? ''),
    audience: (raw.audience as PlanAudience) ?? 'USER',
    monthlyPrice: Number(raw.monthlyPrice ?? raw.price ?? 0),
    yearlyPrice: Number(raw.yearlyPrice ?? 0),
    price: Number(raw.price ?? raw.monthlyPrice ?? 0),
    currency: String(raw.currency ?? 'SAR'),
    yearlyDiscount: Number(raw.yearlyDiscount ?? 0),
    isActive: raw.isActive !== false,
    sortOrder: Number(raw.sortOrder ?? 0),
    permissions: (raw.permissions as PlanPermissions) ?? {},
    displayFeatures:
      (raw.displayFeatures as SubscriptionPlan['displayFeatures']) ?? [],
    features: raw.features as SubscriptionPlan['features'],
  };
  return localizePlan(mapped);
}

export function formatFeatureValue(key: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (key === 'maxAdsPer24Hours' && typeof value === 'number' && value < 0) {
    return 'غير محدود';
  }
  if (key === 'storeCommission' && typeof value === 'number') {
    return `${value}%`;
  }
  return String(value ?? '—');
}

export function formatPlanFeatureText(
  key: string,
  value: unknown,
  valueType?: 'BOOLEAN' | 'NUMBER' | 'STRING' | 'JSON',
): string {
  if (valueType === 'BOOLEAN' || typeof value === 'boolean') {
    return typeof value === 'boolean'
      ? value
        ? 'متاح'
        : 'غير متاح'
      : String(value);
  }

  if (key === 'maxAdsPer24Hours' && typeof value === 'number') {
    if (value < 0) return 'إعلانات غير محدودة';
    if (value === 1) return 'إعلان واحد كل 24 ساعة';
    return `${value} إعلان كل 24 ساعة`;
  }

  if (key === 'monthlyLiveHours' && typeof value === 'number') {
    if (value <= 0) return 'غير متاح';
    return `${value} ساعة بث / شهر`;
  }

  if (key === 'monthlyFeaturedAds' && typeof value === 'number') {
    if (value <= 0) return 'غير متاح';
    return `${value} إعلان مميز / شهر`;
  }

  if (key === 'monthlyPinnedAds' && typeof value === 'number') {
    if (value <= 0) return 'غير متاح';
    return `${value} تثبيت / شهر`;
  }

  if (key === 'storeCommission' && typeof value === 'number') {
    return `${value}%`;
  }

  return formatFeatureValue(key, value);
}

export function isStoreExemptFromPermissions(
  permissions?: PlanPermissions,
): boolean {
  if (!permissions) return false;
  const v = permissions.storeCommission;
  if (typeof v === 'number') return v <= 0;
  return false;
}

/** Minimal fallback when API is unavailable */
export const EMPTY_PLAN: SubscriptionPlan = localizePlan({
  id: 'free',
  slug: 'free',
  name: 'مجاني',
  description: 'ابدأ التداول في سرح مجاناً',
  audience: 'USER',
  monthlyPrice: 0,
  yearlyPrice: 0,
  price: 0,
  currency: 'SAR',
  yearlyDiscount: 0,
  isActive: true,
  sortOrder: 0,
  permissions: {},
  displayFeatures: [],
});
