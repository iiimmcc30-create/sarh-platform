import {
  PROMOTE_AMOUNT_MAX,
  PROMOTE_AMOUNT_MIN,
  PROMOTE_DURATION_HOURS_MAX,
  PROMOTE_DURATION_HOURS_MIN,
  clampPromoteAmount,
  clampPromoteDurationHours,
  durationDaysFromHours,
} from './promotion-limits.config';
import {
  DEFAULT_REACH_FACTORS,
  estimatePromotionReach,
} from './reach-estimate.util';
import {
  interleavePromotedListings,
  promotionSearchScore,
} from './promotion-ranking.util';
import {
  PROMOTION_PLANS,
  promotionPlanForDays,
  promotionTierWeight,
} from './promotion-tiers.config';

describe('promotion limits', () => {
  it('clamps amount to configured bounds', () => {
    expect(clampPromoteAmount(0)).toBe(PROMOTE_AMOUNT_MIN);
    expect(clampPromoteAmount(9.4)).toBe(PROMOTE_AMOUNT_MIN);
    expect(clampPromoteAmount(20.4)).toBe(20);
    expect(clampPromoteAmount(999)).toBe(PROMOTE_AMOUNT_MAX);
  });

  it('clamps duration hours to configured bounds', () => {
    expect(clampPromoteDurationHours(0)).toBe(PROMOTE_DURATION_HOURS_MIN);
    expect(clampPromoteDurationHours(12.6)).toBe(13);
    expect(clampPromoteDurationHours(500)).toBe(PROMOTE_DURATION_HOURS_MAX);
  });

  it('converts hours to whole days (ceil, min 1)', () => {
    expect(durationDaysFromHours(1)).toBe(1);
    expect(durationDaysFromHours(24)).toBe(1);
    expect(durationDaysFromHours(25)).toBe(2);
    expect(durationDaysFromHours(168)).toBe(7);
  });
});

describe('estimatePromotionReach', () => {
  it('applies default factors and clamps duration', () => {
    const reach = estimatePromotionReach(20, 6, DEFAULT_REACH_FACTORS);
    expect(reach.min).toBe(Math.max(50, Math.round(20 * 9 + 6 * 3)));
    expect(reach.max).toBe(
      Math.max(reach.min + 30, Math.round(20 * 15 + 6 * 5)),
    );
    expect(reach.max).toBeGreaterThan(reach.min);
  });

  it('never returns max below min+30', () => {
    const reach = estimatePromotionReach(10, 1, {
      budgetFactorMin: 1,
      budgetFactorMax: 1,
      hourFactorMin: 1,
      hourFactorMax: 1,
    });
    expect(reach.min).toBe(50);
    expect(reach.max).toBe(80);
  });
});

describe('promotion ranking', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps pinned listings first and preserves ids', () => {
    const input = [
      { id: 'r1', promoted: false },
      { id: 'p1', pinned: true },
      { id: 'm1', promoted: true, promotionWeight: 50 },
      { id: 'r2', promoted: false },
    ];
    const out = interleavePromotedListings(input, 6, 6);
    expect(out[0].id).toBe('p1');
    expect(out.map((x) => x.id).sort()).toEqual(
      ['m1', 'p1', 'r1', 'r2'].sort(),
    );
  });

  it('returns input unchanged for empty/single lists', () => {
    expect(interleavePromotedListings([])).toEqual([]);
    const one = [{ id: 'only' }];
    expect(interleavePromotedListings(one)).toBe(one);
  });

  it('scores promotion weight with a soft cap of 3', () => {
    expect(promotionSearchScore(undefined)).toBe(0);
    expect(promotionSearchScore(0)).toBe(0);
    expect(promotionSearchScore(50)).toBe(0.5);
    expect(promotionSearchScore(500)).toBe(3);
  });
});

describe('promotion tiers', () => {
  it('resolves standard weight and unknown fallback', () => {
    expect(promotionTierWeight('standard')).toBe(100);
    expect(promotionTierWeight(null)).toBe(100);
    expect(promotionTierWeight('unknown-tier')).toBe(100);
  });

  it('finds plan by duration days', () => {
    expect(promotionPlanForDays(1)?.amount).toBe(19);
    expect(promotionPlanForDays(2)?.amount).toBe(35);
    expect(promotionPlanForDays(3)).toBeUndefined();
    expect(promotionPlanForDays(99)).toBeUndefined();
    expect(PROMOTION_PLANS).toHaveLength(2);
  });
});
