// Commission calculation — two independent butcher paths:
//   Listing Commission (store publish / ListingFee) = 1%
//   Order Commission (completed butcher orders)     = 10%
// Plan permission `storeCommission` is an exemption flag for butcher platform
// commissions (<= 0 = exempt). It does not set the numeric rate.
import type { PlanPermissions } from '../plans/plan.types';
import { permissionNumber } from '../plans/plan.types';
import {
  calculateListingFeeAmount,
  LISTING_COMMISSION_PERCENT,
  centsToMoney,
  moneyToCents,
} from '../listings/listing-fee';

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

/**
 * Listing / store-publish fee rate (percent of listing price).
 * Creates ListingFee.commission — never used for order totals.
 * Do not expose this constant on butcher-facing or public fee rule copy.
 */
export const BUTCHER_LISTING_COMMISSION_PERCENT = LISTING_COMMISSION_PERCENT;

/**
 * @deprecated Alias for listing rate — prefer BUTCHER_LISTING_COMMISSION_PERCENT.
 * Kept so existing imports keep compiling during the listing/order split.
 */
export const BUTCHER_STORE_COMMISSION_PERCENT =
  BUTCHER_LISTING_COMMISSION_PERCENT;

/**
 * Order commission rate on completed (delivered) butcher orders.
 * Independent of ListingFee. Internal / admin only — never show to butchers.
 */
export const BUTCHER_ORDER_COMMISSION_PERCENT = 10;

/** Merchant payment.orderId for an order-commission ledger row (unique). */
export function butcherOrderCommissionPaymentRef(
  butcherOrderId: string,
): string {
  return `BOC-${butcherOrderId}`;
}

/** @deprecated Use isStoreExemptFromPermissions */
export function isStoreExempt(planId: string): boolean {
  void planId;
  return false;
}

/**
 * Butcher commission exemption from plan permission `storeCommission`.
 * Designed as a general butcher platform-commission exemption flag
 * (label: عمولة المتجر) — applies to listing fees and order commissions.
 */
export function isStoreExemptFromPermissions(
  permissions?: PlanPermissions,
): boolean {
  if (!permissions) return false;
  return (
    permissionNumber(
      permissions,
      'storeCommission',
      BUTCHER_LISTING_COMMISSION_PERCENT,
    ) <= 0
  );
}

export interface CommissionResult {
  commission: number;
  isExempt: boolean;
  dueDate: Date | null;
  ruleDescription: string;
}

export interface OrderCommissionResult {
  commission: number;
  isExempt: boolean;
  /** Rate used for the accrual (admin/audit). Never expose to butchers. */
  ratePercent: number;
  orderAmount: number;
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
  _permissions?: PlanPermissions,
  _audience: 'USER' | 'BUTCHER' = 'USER',
): CommissionResult {
  void category;
  return {
    commission: calculateListingFeeAmount(price),
    isExempt: false,
    dueDate: null,
    ruleDescription: 'عمولة الإعلان 1% وفق تعهد البائع',
  };
}

/**
 * Order commission on a completed butcher order amount.
 * Independent of ListingFee / calculateCommission.
 */
export function calculateOrderCommission(
  orderAmount: number,
  permissions?: PlanPermissions,
): OrderCommissionResult {
  const amount = Number.isFinite(orderAmount) ? Math.max(0, orderAmount) : 0;
  const ratePercent = BUTCHER_ORDER_COMMISSION_PERCENT;

  if (isStoreExemptFromPermissions(permissions)) {
    return {
      commission: 0,
      isExempt: true,
      ratePercent,
      orderAmount: amount,
    };
  }

  return {
    commission: centsToMoney(
      Math.round((moneyToCents(amount) * ratePercent) / 100),
    ),
    isExempt: false,
    ratePercent,
    orderAmount: amount,
  };
}

export function shouldCreateFee(
  listingFeesEnabled: boolean,
  _category?: ListingCat,
  _permissions?: PlanPermissions,
  _audience?: 'USER' | 'BUTCHER',
): boolean {
  return listingFeesEnabled === true;
}

/** Public fee rules — butcher/store rows must not reveal the numeric rate. */
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
