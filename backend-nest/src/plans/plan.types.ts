import type { FeatureValueType, PlanAudience } from '@prisma/client';

export type BillingCycle = 'monthly' | 'yearly';

export type PlanPermissions = Record<
  string,
  boolean | number | string | unknown
>;

export type ResolvedPlan = {
  id: string;
  slug: string;
  name: string;
  description: string;
  audience: PlanAudience;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  yearlyDiscount: number;
  isActive: boolean;
  sortOrder: number;
  permissions: PlanPermissions;
  features: Array<{
    key: string;
    value: string;
    valueType: FeatureValueType;
  }>;
};

export type PlanApiResponse = ResolvedPlan & {
  /** @deprecated Use slug — kept for backward compatibility */
  legacyId?: string;
  price: number;
  yearlyPrice: number;
  /** Dynamic display rows for pricing tables */
  displayFeatures: Array<{
    key: string;
    label: string;
    value: string | number | boolean;
    valueType: FeatureValueType;
  }>;
};

/** Maps legacy plan slugs from pre-migration subscriptions */
export const LEGACY_PLAN_SLUG_MAP: Record<string, string> = {
  starter: 'sarh-pro',
  pro: 'sarh-pro',
  vip: 'sarh-pro',
};

export const FREE_PLAN_SLUG = 'free';

export function normalizePlanSlug(slug: string): string {
  const canonical = slug
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  return LEGACY_PLAN_SLUG_MAP[canonical] ?? canonical;
}

export function parseFeatureValue(
  value: string,
  valueType: FeatureValueType,
): boolean | number | string | unknown {
  switch (valueType) {
    case 'BOOLEAN':
      return value === 'true';
    case 'NUMBER': {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    case 'JSON':
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    default:
      return value;
  }
}

export function buildPermissions(
  features: Array<{ key: string; value: string; valueType: FeatureValueType }>,
): PlanPermissions {
  const permissions: PlanPermissions = {};
  for (const f of features) {
    permissions[f.key] = parseFeatureValue(f.value, f.valueType);
  }
  return permissions;
}

export function isUnlimited(value: number): boolean {
  return value < 0;
}

export function permissionNumber(
  permissions: PlanPermissions,
  key: string,
  fallback = 0,
): number {
  const v = permissions[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

export function permissionBoolean(
  permissions: PlanPermissions,
  key: string,
  fallback = false,
): boolean {
  const v = permissions[key];
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return fallback;
}
