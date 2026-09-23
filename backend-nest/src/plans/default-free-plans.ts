import type { FeatureValueType, PlanAudience } from '@prisma/client';
import { FREE_PLAN_SLUG } from './plan.types';

type FreeFeature = {
  key: string;
  value: string;
  valueType: FeatureValueType;
};

export type DefaultFreePlan = {
  slug: typeof FREE_PLAN_SLUG;
  name: string;
  description: string;
  audience: PlanAudience;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  yearlyDiscount: number;
  sortOrder: number;
  features: FreeFeature[];
};

/** Baseline free plans — created only when missing, never overwrites admin edits. */
export const DEFAULT_FREE_PLANS: DefaultFreePlan[] = [
  {
    slug: FREE_PLAN_SLUG,
    name: 'مجاني',
    description: 'ابدأ التداول في سرح مجاناً',
    audience: 'USER',
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: 'SAR',
    yearlyDiscount: 0,
    sortOrder: 0,
    features: [
      { key: 'maxAdsPer24Hours', value: '1', valueType: 'NUMBER' },
      { key: 'monthlyFeaturedAds', value: '0', valueType: 'NUMBER' },
      { key: 'monthlyPinnedAds', value: '0', valueType: 'NUMBER' },
      { key: 'monthlyLiveHours', value: '0', valueType: 'NUMBER' },
      { key: 'verifiedBadge', value: 'false', valueType: 'BOOLEAN' },
      { key: 'prioritySupport', value: 'false', valueType: 'BOOLEAN' },
      { key: 'prioritySearch', value: 'false', valueType: 'BOOLEAN' },
      { key: 'priorityHome', value: 'false', valueType: 'BOOLEAN' },
      { key: 'canCreateLive', value: 'false', valueType: 'BOOLEAN' },
    ],
  },
  {
    slug: FREE_PLAN_SLUG,
    name: 'مجاني',
    description: 'باقة مجانية للملاحم',
    audience: 'BUTCHER',
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: 'SAR',
    yearlyDiscount: 0,
    sortOrder: 0,
    features: [
      { key: 'storeEnabled', value: 'true', valueType: 'BOOLEAN' },
      { key: 'receiveOrders', value: 'true', valueType: 'BOOLEAN' },
      { key: 'analyticsDashboard', value: 'true', valueType: 'BOOLEAN' },
      { key: 'storeCommission', value: '1', valueType: 'NUMBER' },
      { key: 'monthlyLiveHours', value: '0', valueType: 'NUMBER' },
      { key: 'verifiedBadge', value: 'false', valueType: 'BOOLEAN' },
      { key: 'prioritySupport', value: 'false', valueType: 'BOOLEAN' },
      { key: 'prioritySearch', value: 'false', valueType: 'BOOLEAN' },
      { key: 'canCreateLive', value: 'false', valueType: 'BOOLEAN' },
    ],
  },
];
