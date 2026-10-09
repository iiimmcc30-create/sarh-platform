import {
  STORE_PRODUCTS,
  boostProductFor,
  findStoreProduct,
  subscriptionProductForPlanSlug,
  subscriptionProductForTier,
} from '../store-products';
import {
  PROMOTE_CATALOG,
  lookupPromotePrice,
} from '../../listings/promote-catalog';
import {
  VERIFICATION_PLAN_SLUGS,
  VERIFICATION_TIERS,
} from '../../subscriptions/verification/verification-tiers';

describe('store product catalog', () => {
  it('has unique, well-formed product IDs', () => {
    const ids = STORE_PRODUCTS.map((p) => p.productId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^sa\.sarh\.[a-z0-9.]+$/);
  });

  it('maps every verification tier to one monthly auto-renewable subscription', () => {
    for (const tier of VERIFICATION_TIERS) {
      const product = subscriptionProductForTier(tier);
      expect(product.storeType).toBe('subs');
      expect(product.planSlug).toBe(VERIFICATION_PLAN_SLUGS[tier]);
      expect(product.androidBasePlanId).toBe('monthly');
      expect(subscriptionProductForPlanSlug(product.planSlug)).toBe(product);
    }
    expect(subscriptionProductForTier('gold').productId).toBe(
      'sa.sarh.gold.monthly',
    );
    expect(
      STORE_PRODUCTS.filter((p) => p.kind === 'subscription').map(
        (p) => p.referencePriceSar,
      ),
    ).toEqual([29, 59, 99]);
  });

  it('covers every promote catalog option with a consumable at the catalog price', () => {
    for (const row of PROMOTE_CATALOG) {
      const product = boostProductFor(row.goal, row.durationHours);
      expect(product).not.toBeNull();
      expect(product!.storeType).toBe('in-app');
      expect(product!.referencePriceSar).toBe(row.amount);
      expect(product!.durationHours).toBe(row.durationHours);
    }
  });

  it('prices "both" boosts as featured + pinned like lookupPromotePrice', () => {
    for (const hours of [24, 72]) {
      const product = boostProductFor('both', hours)!;
      expect(product.referencePriceSar).toBe(
        lookupPromotePrice('both', { durationHours: hours })!.amount,
      );
    }
  });

  it('every consumable has a matching backend price', () => {
    for (const p of STORE_PRODUCTS.filter((x) => x.kind !== 'subscription')) {
      const goal = p.kind === 'promotion' ? 'visibility' : p.boostType!;
      expect(
        lookupPromotePrice(goal, { durationHours: p.durationHours })?.amount,
      ).toBe(p.referencePriceSar);
    }
  });

  it('rejects unknown IDs', () => {
    expect(findStoreProduct('sa.sarh.unknown')).toBeNull();
    expect(findStoreProduct(undefined)).toBeNull();
    expect(boostProductFor('featured', 48)).toBeNull();
  });
});
