import { calculateCommission, type ListingCategory } from '@/services/commissions';
import {
  canPayListingFee,
  listingFeeButtonState,
  type ListingFeeSummary,
} from '@/lib/listingFeeState';

/** Fallback category used only to probe the commission rate (the rate is category-independent today). */
const PROBE_CATEGORY = 'sheep' as ListingCategory;

/**
 * Commission percent read from `calculateCommission` (commission on 100 = percent),
 * so the reminder never hardcodes the rate.
 */
export function listingCommissionPercent(category?: string | null): number {
  const probe = calculateCommission((category || PROBE_CATEGORY) as ListingCategory, 100);
  return Math.round(probe.commission * 100) / 100;
}

export type CommissionReminderInput = {
  sold: boolean | null;
  feesEnabled: boolean;
  managedListing: boolean;
  /**
   * Listing fee summary from the detail API (`Listing.fee`). Omitted → no fee info
   * known; null → legacy listing without a fee row (still payable → reminder shows).
   */
  fee?: ListingFeeSummary | null;
  /** Explicit override when the caller already knows the fee is settled. */
  feePaid?: boolean;
};

/** True when the listing fee is paid or exempt (waived) — nothing left to remind about. */
export function isListingFeeSettled(fee: ListingFeeSummary | null | undefined): boolean {
  return !canPayListingFee(listingFeeButtonState(fee));
}

/** Soft reminder shows only when the owner chose «تم البيع» and listing fees apply. Never blocks deletion. */
export function shouldShowCommissionReminder(input: CommissionReminderInput): boolean {
  if (input.sold !== true) return false;
  if (!input.feesEnabled) return false;
  if (input.managedListing) return false;
  if (input.feePaid) return false;
  if (isListingFeeSettled(input.fee)) return false;
  return true;
}

export const COMMISSION_REMINDER_TITLE = 'إذا بعت، لا تنسى عمولة سرح — ذمة وأمانة 🤍';

export function commissionReminderNote(percent: number): string {
  return `العمولة اختيارية وعلى الأمانة (${percent}٪ من قيمة البيع).`;
}
