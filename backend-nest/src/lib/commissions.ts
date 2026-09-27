// Listing commission (ListingFee) = 1% of the listing value.
import { calculateListingFeeAmount } from '../listings/listing-fee';

export type ListingCat =
  | 'camels'
  | 'sheep'
  | 'goats'
  | 'cows'
  | 'horses'
  | 'birds'
  | 'feed'
  | 'equipment'
  | 'store';

export interface CommissionResult {
  commission: number;
  isExempt: boolean;
  dueDate: Date | null;
  ruleDescription: string;
}

/** SAR-style money rounding to 2 decimal places. */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * ListingFee path — 1% of listing value. dueDate is not a publish countdown.
 * Creation is gated by listingFeesEnabled + covenant, not by category/audience.
 */
export function calculateCommission(
  category: ListingCat,
  price: number,
  _quantity = 1,
): CommissionResult {
  void category;
  return {
    commission: calculateListingFeeAmount(price),
    isExempt: false,
    dueDate: null,
    ruleDescription: 'عمولة الإعلان 1% وفق تعهد البائع',
  };
}

export function shouldCreateFee(
  listingFeesEnabled: boolean,
  _category?: ListingCat,
): boolean {
  return listingFeesEnabled === true;
}

/** Public fee rules. */
export const COMMISSION_TABLE = [
  {
    icon: '📜',
    nameAr: 'عمولة الإعلان',
    nameEn: 'Listing commission',
    ruleAr: '١٪ من قيمة البيع — تُسدد خلال ١٤ يوماً من إتمام البيع خارج المنصة',
    ruleEn: '1% of sale value — due within 14 days of off-platform sale',
    color: '#A855F7',
  },
];
