/** Platform reference point (Riyadh) for static distance normalization. */
export const PLATFORM_REFERENCE_LAT = 24.7136;
export const PLATFORM_REFERENCE_LNG = 46.6753;

export const RANKING_WEIGHTS = {
  orders: 0.4,
  rating: 0.25,
  favorites: 0.15,
  distance: 0.1,
  speed: 0.05,
  newBoost: 0.05,
} as const;

export const MIN_ORDERS_FOR_RATING = 10;
export const NEW_BUTCHER_BOOST_DAYS = 30;
export const REVIEW_EDIT_WINDOW_DAYS = 14;

export type PlatformBounds = {
  minOrders: number;
  maxOrders: number;
  minRating: number;
  maxRating: number;
  minFavorites: number;
  maxFavorites: number;
  minSpeed: number;
  maxSpeed: number;
  minDistanceKm: number;
  maxDistanceKm: number;
};

export function minMaxNormalize(
  value: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return 0;
  if (max <= min) return 50;
  const n = ((value - min) / (max - min)) * 100;
  return Math.max(0, Math.min(100, n));
}

/** Invert distance: closer to reference = higher score (0-100). */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function invertDistanceScore(
  km: number,
  minKm: number,
  maxKm: number,
): number {
  if (!Number.isFinite(km)) return 50;
  if (maxKm <= minKm) return 50;
  const closeness = 1 - (km - minKm) / (maxKm - minKm);
  return Math.max(0, Math.min(100, closeness * 100));
}

export function computeNewButcherBoost(
  createdAt: Date,
  now = new Date(),
): number {
  const ageMs = now.getTime() - createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays >= NEW_BUTCHER_BOOST_DAYS) return 0;
  const remaining = NEW_BUTCHER_BOOST_DAYS - ageDays;
  return (remaining / NEW_BUTCHER_BOOST_DAYS) * 100;
}

export function computeRankingScore(parts: {
  normalizedOrders: number;
  normalizedRating: number;
  normalizedFavorites: number;
  normalizedDistance: number;
  normalizedSpeed: number;
  newButcherBoost: number;
}): number {
  const score =
    parts.normalizedOrders * RANKING_WEIGHTS.orders +
    parts.normalizedRating * RANKING_WEIGHTS.rating +
    parts.normalizedFavorites * RANKING_WEIGHTS.favorites +
    parts.normalizedDistance * RANKING_WEIGHTS.distance +
    parts.normalizedSpeed * RANKING_WEIGHTS.speed +
    parts.newButcherBoost * RANKING_WEIGHTS.newBoost;
  return Math.round(score * 100) / 100;
}

export function speedRawScore(
  avgAcceptMinutes: number | null,
  avgPrepMinutes: number | null,
  avgCompleteMinutes: number | null,
): number {
  const parts = [avgAcceptMinutes, avgPrepMinutes, avgCompleteMinutes].filter(
    (v): v is number => v != null && Number.isFinite(v) && v >= 0,
  );
  if (parts.length === 0) return 0;
  const totalMinutes = parts.reduce((a, b) => a + b, 0);
  if (totalMinutes <= 0) return 100;
  return 100 / (1 + totalMinutes / 60);
}
