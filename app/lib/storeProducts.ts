/**
 * Apple In-App Purchase / Google Play Billing product IDs (native apps only).
 *
 * MIRROR of backend-nest/src/store-purchases/store-products.ts — the server is
 * the source of truth (it verifies and grants); __tests__/store-products.test.ts
 * fails if the two drift. referencePriceSar is the catalog price used to set
 * the store price points; the UI always shows the store-localized price
 * (displayPrice from StoreKit / Play Billing).
 */

export type StoreProductKind = 'subscription' | 'boost' | 'promotion';
export type StoreBoostType = 'featured' | 'pinned' | 'both';

export type StoreProduct = {
  productId: string;
  kind: StoreProductKind;
  /** expo-iap / StoreKit product type. */
  storeType: 'subs' | 'in-app';
  /** Reference price in SAR (set the nearest store price point). */
  referencePriceSar: number;
  titleAr: string;
  /** Subscriptions: Plan.slug + tier + billing period. */
  planSlug?: string;
  tier?: 'blue' | 'blue_plus' | 'gold';
  billingCycle?: 'monthly';
  /** Google Play base plan id for subscriptions. */
  androidBasePlanId?: string;
  /** Consumables: what one purchase grants. */
  boostType?: StoreBoostType;
  durationHours?: number;
  durationDays?: number;
};

/** One App Store subscription group / one Play subscription per tier. */
export const STORE_SUBSCRIPTION_GROUP = 'Sarh Verification';
export const ANDROID_SUBSCRIPTION_BASE_PLAN = 'monthly';

export const STORE_PRODUCTS: readonly StoreProduct[] = [
  {
    productId: 'sa.sarh.verification.blue.monthly',
    kind: 'subscription',
    storeType: 'subs',
    referencePriceSar: 29,
    titleAr: 'توثيق Blue — شهري',
    planSlug: 'blue-badge',
    tier: 'blue',
    billingCycle: 'monthly',
    androidBasePlanId: ANDROID_SUBSCRIPTION_BASE_PLAN,
  },
  {
    productId: 'sa.sarh.verification.blueplus.monthly',
    kind: 'subscription',
    storeType: 'subs',
    referencePriceSar: 59,
    titleAr: 'توثيق Blue+ — شهري',
    planSlug: 'blue-plus-badge',
    tier: 'blue_plus',
    billingCycle: 'monthly',
    androidBasePlanId: ANDROID_SUBSCRIPTION_BASE_PLAN,
  },
  {
    productId: 'sa.sarh.gold.monthly',
    kind: 'subscription',
    storeType: 'subs',
    referencePriceSar: 99,
    titleAr: 'Gold — شهري',
    planSlug: 'gold-badge',
    tier: 'gold',
    billingCycle: 'monthly',
    androidBasePlanId: ANDROID_SUBSCRIPTION_BASE_PLAN,
  },
  {
    productId: 'sa.sarh.boost.featured.1d',
    kind: 'boost',
    storeType: 'in-app',
    referencePriceSar: 9,
    titleAr: 'تمييز الإعلان — يوم واحد',
    boostType: 'featured',
    durationHours: 24,
    durationDays: 1,
  },
  {
    productId: 'sa.sarh.boost.featured.3d',
    kind: 'boost',
    storeType: 'in-app',
    referencePriceSar: 25,
    titleAr: 'تمييز الإعلان — ٣ أيام',
    boostType: 'featured',
    durationHours: 72,
    durationDays: 3,
  },
  {
    productId: 'sa.sarh.boost.pinned.1d',
    kind: 'boost',
    storeType: 'in-app',
    referencePriceSar: 12,
    titleAr: 'تثبيت الإعلان — يوم واحد',
    boostType: 'pinned',
    durationHours: 24,
    durationDays: 1,
  },
  {
    productId: 'sa.sarh.boost.pinned.3d',
    kind: 'boost',
    storeType: 'in-app',
    referencePriceSar: 29,
    titleAr: 'تثبيت الإعلان — ٣ أيام',
    boostType: 'pinned',
    durationHours: 72,
    durationDays: 3,
  },
  {
    productId: 'sa.sarh.boost.both.1d',
    kind: 'boost',
    storeType: 'in-app',
    referencePriceSar: 21,
    titleAr: 'تثبيت وتمييز — يوم واحد',
    boostType: 'both',
    durationHours: 24,
    durationDays: 1,
  },
  {
    productId: 'sa.sarh.boost.both.3d',
    kind: 'boost',
    storeType: 'in-app',
    referencePriceSar: 54,
    titleAr: 'تثبيت وتمييز — ٣ أيام',
    boostType: 'both',
    durationHours: 72,
    durationDays: 3,
  },
  {
    productId: 'sa.sarh.boost.promote.1d',
    kind: 'promotion',
    storeType: 'in-app',
    referencePriceSar: 19,
    titleAr: 'تعزيز الظهور — يوم واحد',
    durationHours: 24,
    durationDays: 1,
  },
  {
    productId: 'sa.sarh.boost.promote.2d',
    kind: 'promotion',
    storeType: 'in-app',
    referencePriceSar: 35,
    titleAr: 'تعزيز الظهور — يومين',
    durationHours: 48,
    durationDays: 2,
  },
];

export function findStoreProduct(
  productId: string | null | undefined,
): StoreProduct | null {
  if (!productId) return null;
  return STORE_PRODUCTS.find((p) => p.productId === productId) ?? null;
}

export function subscriptionProductForTier(
  tier: 'blue' | 'blue_plus' | 'gold',
): StoreProduct {
  const product = STORE_PRODUCTS.find(
    (p) => p.kind === 'subscription' && p.tier === tier,
  );
  if (!product) throw new Error(`No store subscription for tier ${tier}`);
  return product;
}

export function subscriptionProductForPlanSlug(
  planSlug: string | null | undefined,
): StoreProduct | null {
  if (!planSlug) return null;
  return (
    STORE_PRODUCTS.find(
      (p) => p.kind === 'subscription' && p.planSlug === planSlug,
    ) ?? null
  );
}

/** goal: featured | pinned | both | visibility (promotion). */
export function boostProductFor(
  goal: StoreBoostType | 'visibility' | 'promotion',
  durationHours: number,
): StoreProduct | null {
  const kind: StoreProductKind =
    goal === 'visibility' || goal === 'promotion' ? 'promotion' : 'boost';
  return (
    STORE_PRODUCTS.find(
      (p) =>
        p.kind === kind &&
        (kind === 'promotion' || p.boostType === goal) &&
        p.durationHours === Math.round(durationHours),
    ) ?? null
  );
}
