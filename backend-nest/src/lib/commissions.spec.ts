import {
  calculateCommission,
  roundMoney,
  shouldCreateFee,
} from './commissions';
import { LISTING_COMMISSION_PERCENT } from '../listings/listing-fee';

describe('commissions — listing commission', () => {
  it('keeps listing rate at 1%', () => {
    expect(LISTING_COMMISSION_PERCENT).toBe(1);
  });

  it('listing 1% applies to livestock and store alike', () => {
    expect(calculateCommission('sheep', 1000, 2).commission).toBe(10);
    expect(calculateCommission('store', 5000, 1).commission).toBe(50);
  });

  it('listing value 100 → listing commission 1', () => {
    const r = calculateCommission('store', 100, 1);
    expect(r.commission).toBe(1);
    expect(r.dueDate).toBeNull();
  });

  it('rounds 0.1 + 0.2 using cents, not binary float', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it('shouldCreateFee follows listingFeesEnabled', () => {
    expect(shouldCreateFee(true)).toBe(true);
    expect(shouldCreateFee(false)).toBe(false);
  });

  it('applies 1% to non-store listing values', () => {
    expect(calculateCommission('sheep', 1000, 3).commission).toBe(10);
    expect(calculateCommission('horses', 1000, 1).commission).toBe(10);
  });
});
