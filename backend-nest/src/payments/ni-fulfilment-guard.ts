/**
 * Fulfilment guard for N-Genius payments.
 *
 * N-Genius does not sign its webhooks (see ni-webhook-header.util), so a
 * webhook payload is only a hint. Before any subscription / boost / promotion
 * / fee is fulfilled we re-read the order from the NI API (by the NI order
 * UUID we stored at checkout, never by an id taken from the payload) and
 * require: a captured/purchased state AND the exact amount + currency of our
 * local Payment row. Anything else is held for manual review.
 */
import { classifyNiOrderState } from './ni-client';

export function normalizeMoney(value: number): number {
  return Math.round(value * 100);
}

export function sameMoneyAmount(a: number, b: number): boolean {
  return normalizeMoney(a) === normalizeMoney(b);
}

/** NI order `amount` is `{ currencyCode, value }` in minor units (halalas). */
export function extractNiOrderAmount(
  order: Record<string, unknown> | null | undefined,
): { amount: number; currency: string } | null {
  const raw = order?.amount as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') return null;
  const value = Number(raw.value);
  const currency =
    typeof raw.currencyCode === 'string' ? raw.currencyCode.trim() : '';
  if (!Number.isFinite(value) || value <= 0 || !currency) return null;
  return { amount: value / 100, currency: currency.toUpperCase() };
}

export type NiFulfilmentCheck =
  | { ok: true; niAmount: number; niCurrency: string }
  | {
      ok: false;
      reason:
        | 'not_captured'
        | 'amount_missing'
        | 'amount_mismatch'
        | 'currency_mismatch';
      niAmount?: number;
      niCurrency?: string;
    };

/** Only CAPTURED / PURCHASED (and NI's PAID / SUCCESS aliases) may fulfil. */
export function checkNiOrderForFulfilment(
  order: Record<string, unknown>,
  state: string,
  payment: { amount: number; currency?: string | null },
): NiFulfilmentCheck {
  if (classifyNiOrderState(state) !== 'success') {
    return { ok: false, reason: 'not_captured' };
  }
  const ni = extractNiOrderAmount(order);
  if (!ni) return { ok: false, reason: 'amount_missing' };
  const ours = (payment.currency || 'SAR').trim().toUpperCase();
  if (ni.currency !== ours) {
    return {
      ok: false,
      reason: 'currency_mismatch',
      niAmount: ni.amount,
      niCurrency: ni.currency,
    };
  }
  if (!sameMoneyAmount(ni.amount, Number(payment.amount))) {
    return {
      ok: false,
      reason: 'amount_mismatch',
      niAmount: ni.amount,
      niCurrency: ni.currency,
    };
  }
  return { ok: true, niAmount: ni.amount, niCurrency: ni.currency };
}

/** True when a previous check already parked this payment for manual review. */
export function isPaymentHeldForReview(metadata: unknown): boolean {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  return meta.reviewRequired === true;
}
