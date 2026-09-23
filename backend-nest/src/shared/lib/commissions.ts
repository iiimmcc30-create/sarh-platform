// Compatibility shim — listing fee is 1%. Order commission lives in src/lib/commissions.ts
import {
  calculateListingFeeAmount,
  LISTING_COMMISSION_PERCENT,
} from '../../listings/listing-fee';

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

export function calculateCommission(
  _category: ListingCat,
  price: number,
): { commission: number; isExempt: boolean; dueDate: Date | null; ruleDescription: string } {
  return {
    commission: calculateListingFeeAmount(price),
    isExempt: false,
    dueDate: null,
    ruleDescription: `عمولة الإعلان ${LISTING_COMMISSION_PERCENT}%`,
  };
}

export function shouldCreateFee(_category: ListingCat, _planId?: string): boolean {
  return true;
}

export const COMMISSION_TABLE = [
  {
    icon: '📜',
    nameAr: 'عمولة الإعلان',
    nameEn: 'Listing commission',
    ruleAr: '١٪ من قيمة البيع',
    ruleEn: '1% of sale value',
    color: '#A855F7',
  },
];
