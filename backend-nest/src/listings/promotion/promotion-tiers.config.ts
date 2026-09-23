import { promotionPlansFromCatalog } from '../promote-catalog';

/** Extensible promotion tiers — add new keys without schema changes. */
export type PromotionTierKey = 'standard';

export type PromotionTierConfig = {
  key: PromotionTierKey;
  weight: number;
  labelAr: string;
  descriptionAr: string;
};

export const PROMOTION_TIERS: Record<PromotionTierKey, PromotionTierConfig> = {
  standard: {
    key: 'standard',
    weight: 100,
    labelAr: 'ترويج',
    descriptionAr:
      'زد وصول إعلانك ليظهر في أماكن متعددة داخل التطبيق ويحقق مشاهدات أكثر.',
  },
};

export type PromotionPlanOption = {
  durationDays: number;
  durationHours?: number;
  amount: number;
  labelAr: string;
};

/** Paid promotion pricing — official catalog (visibility). */
export const PROMOTION_PLANS: PromotionPlanOption[] =
  promotionPlansFromCatalog();

export const PROMOTION_INTERVAL_MIN = 6;
export const PROMOTION_INTERVAL_MAX = 8;

export function promotionTierWeight(tier: string | null | undefined): number {
  const key = (tier ?? 'standard') as PromotionTierKey;
  return PROMOTION_TIERS[key]?.weight ?? PROMOTION_TIERS.standard.weight;
}

export function promotionPlanForDays(
  durationDays: number,
): PromotionPlanOption | undefined {
  return PROMOTION_PLANS.find((p) => p.durationDays === durationDays);
}
