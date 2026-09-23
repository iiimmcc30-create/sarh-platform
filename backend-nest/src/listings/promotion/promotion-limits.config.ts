import { PROMOTE_CATALOG_AMOUNT_MIN } from '../promote-catalog';

/** Lowest chargeable promote amount — official catalog floor, not a markup. */
export const PROMOTE_AMOUNT_MIN = PROMOTE_CATALOG_AMOUNT_MIN;
export const PROMOTE_AMOUNT_MAX = 500;
export const PROMOTE_DURATION_HOURS_MIN = 1;
export const PROMOTE_DURATION_HOURS_MAX = 168;

export function clampPromoteAmount(value: number): number {
  return Math.min(
    PROMOTE_AMOUNT_MAX,
    Math.max(PROMOTE_AMOUNT_MIN, Math.round(value)),
  );
}

export function clampPromoteDurationHours(value: number): number {
  return Math.min(
    PROMOTE_DURATION_HOURS_MAX,
    Math.max(PROMOTE_DURATION_HOURS_MIN, Math.round(value)),
  );
}

export function durationDaysFromHours(hours: number): number {
  return Math.max(1, Math.ceil(hours / 24));
}
