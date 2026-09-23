import {
  calculateListingFeeAmount,
  parsePositiveMoneyAmount,
  moneyToCents,
  centsToMoney,
} from './listing-fee';

describe('listing fee 1%', () => {
  it('100 → 1, 1000 → 10, 10000 → 100', () => {
    expect(calculateListingFeeAmount(100)).toBe(1);
    expect(calculateListingFeeAmount(1000)).toBe(10);
    expect(calculateListingFeeAmount(10000)).toBe(100);
  });

  it('rejects negative, zero, NaN, Infinity, and non-numeric strings', () => {
    expect(parsePositiveMoneyAmount(-1)).toBeNull();
    expect(parsePositiveMoneyAmount(0)).toBeNull();
    expect(parsePositiveMoneyAmount(Number.NaN)).toBeNull();
    expect(parsePositiveMoneyAmount(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parsePositiveMoneyAmount('abc')).toBeNull();
    expect(parsePositiveMoneyAmount('10000')).toBe(10000);
  });

  it('uses integer cents so 0.1 + 0.2 and 1% of 10000 stay exact', () => {
    expect(moneyToCents(0.1) + moneyToCents(0.2)).toBe(30);
    expect(centsToMoney(30)).toBe(0.3);
    expect(calculateListingFeeAmount(10000)).toBe(100);
    expect(calculateListingFeeAmount(1)).toBe(0.01);
  });

  it('refund of a listing fee amount stays on the 2-decimal grid', () => {
    const fee = calculateListingFeeAmount(99.99);
    expect(fee).toBe(1);
    expect(centsToMoney(moneyToCents(fee))).toBe(fee);
  });
});
