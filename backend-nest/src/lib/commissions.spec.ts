import {
  BUTCHER_LISTING_COMMISSION_PERCENT,
  BUTCHER_ORDER_COMMISSION_PERCENT,
  BUTCHER_STORE_COMMISSION_PERCENT,
  butcherOrderCommissionPaymentRef,
  calculateCommission,
  calculateOrderCommission,
  isStoreExemptFromPermissions,
  roundMoney,
  shouldCreateFee,
} from './commissions';

describe('commissions — listing vs order separation', () => {
  it('keeps listing rate at 1% and order rate at 10%', () => {
    expect(BUTCHER_LISTING_COMMISSION_PERCENT).toBe(1);
    expect(BUTCHER_STORE_COMMISSION_PERCENT).toBe(1);
    expect(BUTCHER_ORDER_COMMISSION_PERCENT).toBe(10);
  });

  it('listing 1% applies to livestock and store alike', () => {
    expect(calculateCommission('sheep', 1000, 2, {}, 'USER').commission).toBe(
      10,
    );
    expect(calculateCommission('store', 5000, 1, {}, 'USER').commission).toBe(
      50,
    );
  });

  it('listing value 100 → listing commission 1', () => {
    const r = calculateCommission('store', 100, 1, {}, 'BUTCHER');
    expect(r.commission).toBe(1);
    expect(r.dueDate).toBeNull();
  });

  it('uses platform listing 1% even when plan feature still stores legacy 5', () => {
    const r = calculateCommission(
      'store',
      1000,
      1,
      { storeCommission: 5 },
      'BUTCHER',
    );
    expect(r.commission).toBe(10);
  });

  it('listing fee is not waived by storeCommission 0 (order path still is)', () => {
    const r = calculateCommission(
      'store',
      1000,
      1,
      { storeCommission: 0 },
      'BUTCHER',
    );
    expect(r.commission).toBe(10);
  });

  it('order value 100 → order commission 10', () => {
    const r = calculateOrderCommission(100, { storeCommission: 1 });
    expect(r.isExempt).toBe(false);
    expect(r.commission).toBe(10);
    expect(r.ratePercent).toBe(10);
  });

  it('changing order rate constant does not affect listing calc', () => {
    expect(BUTCHER_ORDER_COMMISSION_PERCENT).toBe(10);
    const listing = calculateCommission(
      'store',
      100,
      1,
      { storeCommission: 1 },
      'BUTCHER',
    );
    expect(listing.commission).toBe(1);
  });

  it('non-completed order amounts are not charged by calculateOrderCommission alone — callers gate status', () => {
    // Pure calc always returns a number; lifecycle must only call on delivered.
    expect(
      calculateOrderCommission(100, { storeCommission: 1 }).commission,
    ).toBe(10);
  });

  it('subscription exemption zeros order commission', () => {
    const r = calculateOrderCommission(100, { storeCommission: 0 });
    expect(r.isExempt).toBe(true);
    expect(r.commission).toBe(0);
  });

  it('rounds 0.1 + 0.2 using cents, not binary float', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(
      calculateOrderCommission(0.3, { storeCommission: 1 }).commission,
    ).toBe(0.03);
  });

  it('exemption helpers respect subscription zero-rate', () => {
    expect(isStoreExemptFromPermissions({ storeCommission: 0 })).toBe(true);
    expect(isStoreExemptFromPermissions({ storeCommission: 1 })).toBe(false);
    expect(isStoreExemptFromPermissions({ storeCommission: 10 })).toBe(false);
  });

  it('shouldCreateFee follows listingFeesEnabled, not butcher/store', () => {
    expect(shouldCreateFee(true)).toBe(true);
    expect(shouldCreateFee(false)).toBe(false);
  });

  it('applies 1% to non-store listing values', () => {
    expect(calculateCommission('sheep', 1000, 3, {}, 'USER').commission).toBe(
      10,
    );
    expect(calculateCommission('horses', 1000, 1, {}, 'USER').commission).toBe(
      10,
    );
  });

  it('builds stable idempotent payment refs per order', () => {
    expect(butcherOrderCommissionPaymentRef('abc')).toBe('BOC-abc');
  });
});
