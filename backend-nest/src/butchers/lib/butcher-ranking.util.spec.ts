import {
  NEW_BUTCHER_BOOST_DAYS,
  PLATFORM_REFERENCE_LAT,
  PLATFORM_REFERENCE_LNG,
  computeNewButcherBoost,
  computeRankingScore,
  distanceKm,
  invertDistanceScore,
  minMaxNormalize,
  speedRawScore,
} from './butcher-ranking.util';

describe('butcher-ranking.util', () => {
  describe('minMaxNormalize', () => {
    it('maps values into 0–100', () => {
      expect(minMaxNormalize(0, 0, 100)).toBe(0);
      expect(minMaxNormalize(50, 0, 100)).toBe(50);
      expect(minMaxNormalize(100, 0, 100)).toBe(100);
      expect(minMaxNormalize(200, 0, 100)).toBe(100);
      expect(minMaxNormalize(-10, 0, 100)).toBe(0);
    });

    it('returns midpoint when max <= min or non-finite', () => {
      expect(minMaxNormalize(5, 10, 10)).toBe(50);
      expect(minMaxNormalize(Number.NaN, 0, 10)).toBe(0);
    });
  });

  describe('distanceKm / invertDistanceScore', () => {
    it('returns ~0 for identical points', () => {
      expect(
        distanceKm(
          PLATFORM_REFERENCE_LAT,
          PLATFORM_REFERENCE_LNG,
          PLATFORM_REFERENCE_LAT,
          PLATFORM_REFERENCE_LNG,
        ),
      ).toBeCloseTo(0, 5);
    });

    it('scores closer distances higher', () => {
      const near = invertDistanceScore(5, 0, 100);
      const far = invertDistanceScore(90, 0, 100);
      expect(near).toBeGreaterThan(far);
      expect(invertDistanceScore(Number.NaN, 0, 100)).toBe(50);
    });
  });

  describe('computeNewButcherBoost', () => {
    it('is full at creation and zero after window', () => {
      const now = new Date('2026-08-12T00:00:00.000Z');
      expect(computeNewButcherBoost(now, now)).toBe(100);
      const old = new Date(
        now.getTime() - (NEW_BUTCHER_BOOST_DAYS + 1) * 864e5,
      );
      expect(computeNewButcherBoost(old, now)).toBe(0);
      const mid = new Date(
        now.getTime() - (NEW_BUTCHER_BOOST_DAYS / 2) * 864e5,
      );
      expect(computeNewButcherBoost(mid, now)).toBeCloseTo(50, 5);
    });
  });

  describe('computeRankingScore / speedRawScore', () => {
    it('weights parts according to RANKING_WEIGHTS', () => {
      const score = computeRankingScore({
        normalizedOrders: 100,
        normalizedRating: 0,
        normalizedFavorites: 0,
        normalizedDistance: 0,
        normalizedSpeed: 0,
        newButcherBoost: 0,
      });
      expect(score).toBe(40);
    });

    it('returns 0 without speed samples and higher for faster kitchens', () => {
      expect(speedRawScore(null, null, null)).toBe(0);
      expect(speedRawScore(0, 0, 0)).toBe(100);
      const fast = speedRawScore(5, 10, 15);
      const slow = speedRawScore(60, 60, 60);
      expect(fast).toBeGreaterThan(slow);
    });
  });
});
