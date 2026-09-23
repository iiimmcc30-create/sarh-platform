/** Listing Fee = 1% of declared listing/sale amount. Independent of order commission. */
export const LISTING_COMMISSION_PERCENT = 1;

/** Covenant copy: seller has 14 days after an off-platform sale to pay. Not a publish countdown. */
export const LISTING_FEE_SETTLEMENT_DAYS = 14;

export const LISTING_COVENANT_VERSION = 'listing-covenant-v2';

const MIN_AMOUNT_CENTS = 1;
const MAX_AMOUNT_CENTS = 1_000_000_000; // 10_000_000.00 SAR

export function moneyToCents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100);
}

export function centsToMoney(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * 1% of a money amount using integer cents (10000 → 100, 1000 → 10, 100 → 1).
 */
export function calculateListingFeeAmount(amount: number): number {
  const cents = moneyToCents(amount);
  const feeCents = Math.round((cents * LISTING_COMMISSION_PERCENT) / 100);
  return centsToMoney(feeCents);
}

export function parsePositiveMoneyAmount(raw: unknown): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const cents = moneyToCents(raw);
    if (cents < MIN_AMOUNT_CENTS || cents > MAX_AMOUNT_CENTS) return null;
    return centsToMoney(cents);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim().replace(/,/g, '');
    if (!trimmed || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
    const n = Number(trimmed);
    return parsePositiveMoneyAmount(n);
  }
  return null;
}
