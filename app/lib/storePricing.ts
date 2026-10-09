// Store-price presentation for the native apps (Apple IAP / Google Play).
// The store charges its own localized price, so per-day / saving maths based
// on the SAR catalog is not shown there; the web keeps the catalog labels.
import type { PromotePlanView } from '@/lib/promotePage';
import { STORE_PRODUCTS, boostProductFor } from '@/lib/storeProducts';
import type { StorePrice } from '@/services/iap';

/** Every consumable (boost / promotion) product ID. */
export const STORE_LISTING_PRODUCT_IDS: string[] = STORE_PRODUCTS.filter((p) => p.storeType === 'in-app').map(
  (p) => p.productId,
);

/** Promote-screen goal → store product ID (null when not sold in the store). */
export function promoteGoalProductId(
  goal: 'featured' | 'pinned' | 'visibility' | 'both' | null | undefined,
  durationHours: number | null | undefined,
): string | null {
  if (!goal || !durationHours) return null;
  return boostProductFor(goal, durationHours)?.productId ?? null;
}

/** Plan cards with the store-localized price (no catalog per-day / saving / best-value). */
export function storePlanViews(
  plans: PromotePlanView[],
  goal: 'featured' | 'pinned' | 'visibility',
  prices: Record<string, StorePrice>,
): PromotePlanView[] {
  return plans.map((plan) => {
    const id = promoteGoalProductId(goal, plan.durationHours);
    return {
      ...plan,
      priceLabel: (id && prices[id]?.displayPrice) || '—',
      perDayLabel: null,
      savingLabel: null,
      bestValue: false,
    };
  });
}

export function storeCtaLabel(displayPrice: string | null | undefined): string {
  return displayPrice ? `عزّز الآن · ${displayPrice}` : 'عزّز الآن';
}
