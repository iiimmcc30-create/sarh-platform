import { readFileSync } from 'fs';
import path from 'path';
import {
  PROMOTE_CATALOG,
  PROMOTE_CATALOG_AMOUNT_MIN,
  lookupPromotePrice,
  boostPlansFromCatalog,
  promotionPlansFromCatalog,
} from '@/services/promoteCatalog';
import { FALLBACK_BOOST_PLANS } from '@/services/listingBoost';
import { FALLBACK_PROMOTION_PLANS } from '@/services/listingPromotion';
import {
  PROMOTE_AMOUNT_MIN,
  buildPromoteCheckoutPayload,
  clampPromoteAmount,
  formatPromoteAmount,
  resolvePromoteAmount,
} from '@/services/listingPromote';

const OFFICIAL = [
  { goal: 'featured', durationHours: 24, amount: 9 },
  { goal: 'featured', durationHours: 72, amount: 25 },
  { goal: 'pinned', durationHours: 24, amount: 12 },
  { goal: 'pinned', durationHours: 72, amount: 29 },
  { goal: 'visibility', durationHours: 24, amount: 19 },
  { goal: 'visibility', durationHours: 48, amount: 35 },
] as const;

describe('promote catalog SSOT', () => {
  it('matches the official Sarh table', () => {
    expect(
      PROMOTE_CATALOG.map((row) => ({
        goal: row.goal,
        durationHours: row.durationHours,
        amount: row.amount,
      })),
    ).toEqual(OFFICIAL);
  });

  it('matches the server catalog file', () => {
    const server = readFileSync(
      path.join(__dirname, '../../backend-nest/src/listings/promote-catalog.ts'),
      'utf8',
    );
    for (const row of OFFICIAL) {
      expect(server).toContain(`goal: '${row.goal}'`);
      expect(server).toContain(`durationHours: ${row.durationHours}`);
      expect(server).toContain(`amount: ${row.amount}`);
    }
    expect(server).not.toContain('amount: 10');
    expect(server).not.toContain('amount: 30');
    expect(server).not.toContain('amount: 36');
  });

  it('uses catalog fallbacks in boost/promotion clients', () => {
    expect(FALLBACK_BOOST_PLANS.featured.map((row) => row.amount)).toEqual([9, 25]);
    expect(FALLBACK_BOOST_PLANS.pinned.map((row) => row.amount)).toEqual([12, 29]);
    expect(FALLBACK_PROMOTION_PLANS.map((row) => row.amount)).toEqual([19, 35]);
    expect(boostPlansFromCatalog().both[0].amount).toBe(21);
    expect(promotionPlansFromCatalog()).toHaveLength(2);
  });

  it('never lets a client budget change the preview amount', () => {
    expect(resolvePromoteAmount('featured', 24, 1)).toBe(9);
    expect(resolvePromoteAmount('featured', 24, 999)).toBe(9);
    expect(lookupPromotePrice('visibility', { durationHours: 48 })?.amount).toBe(35);
    const payload = buildPromoteCheckoutPayload('ad-1', 'featured', 24, 999);
    expect(payload?.promotionAmount).toBe(9);
    expect(payload?.totalAmount).toBe(9);
  });

  it('does not lift a 9 SAR catalog price to 10', () => {
    expect(PROMOTE_CATALOG_AMOUNT_MIN).toBe(9);
    expect(PROMOTE_AMOUNT_MIN).toBe(9);
    expect(clampPromoteAmount(9)).toBe(9);
    expect(clampPromoteAmount(1)).toBe(9);
    expect(formatPromoteAmount(9)).toContain('ريال');
  });

  it('keeps selection, payload, and catalog aligned for every official option', () => {
    for (const row of OFFICIAL) {
      expect(
        lookupPromotePrice(row.goal, { durationHours: row.durationHours })?.amount,
      ).toBe(row.amount);
      expect(resolvePromoteAmount(row.goal, row.durationHours)).toBe(row.amount);
      const payload = buildPromoteCheckoutPayload('ad-1', row.goal, row.durationHours);
      expect(payload?.promotionAmount).toBe(row.amount);
      expect(payload?.totalAmount).toBe(row.amount);
    }
  });

  it('renders the promote summary from the catalog amount, not a quote clamp', () => {
    const screen = readFileSync(
      path.join(__dirname, '../app/listing/[id]/promote.tsx'),
      'utf8',
    );
    expect(screen).toContain('displayPrice = selectedDuration?.amount');
    expect(screen).toContain('formatPromoteAmount');
    expect(screen).toContain('ملخص التعزيز');
    expect(screen).toContain('المتابعة للدفع');
    expect(screen).toContain('<BottomAction>');
    expect(screen).not.toContain('quotedAmount');
    expect(screen).not.toContain('ر.س');
    expect(screen).not.toContain('السعر النهائي يُحدَّد من الخادم');
    expect(screen).not.toContain('summary={{');
  });
});
