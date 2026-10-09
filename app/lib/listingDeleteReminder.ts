import { calculateCommission, type ListingCategory } from '@/services/commissions';

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
  /** Pass true only when the client knows the fee is already paid. */
  feePaid?: boolean;
};

/** Soft reminder shows only when the owner chose «تم البيع» and listing fees apply. Never blocks deletion. */
export function shouldShowCommissionReminder(input: CommissionReminderInput): boolean {
  if (input.sold !== true) return false;
  if (!input.feesEnabled) return false;
  if (input.managedListing) return false;
  if (input.feePaid) return false;
  return true;
}

export const COMMISSION_REMINDER_TITLE = 'إذا بعت، لا تنسى عمولة سرح — ذمة وأمانة 🤍';

export function commissionReminderNote(percent: number): string {
  return `العمولة اختيارية وعلى الأمانة (${percent}٪ من قيمة البيع).`;
}
