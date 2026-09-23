/**
 * Completed butcher sale for reports.
 *
 * Source of truth: ButcherOrder.paymentStatus (set when Payment for
 * referenceType=butcher_order is marked paid) plus OrderStatus.
 *
 * Counted: paymentStatus === 'paid' AND status !== 'cancelled'
 *   (includes paid pending/confirmed/preparing/ready/delivered)
 * Not counted: unpaid, failed, refunded, cancelled
 *
 * This is not a new commercial KPI. It is the existing order payment gate
 * (`payment_required` before confirm) minus cancelled orders.
 */
export const SALE_PAYMENT_STATUS = 'paid' as const;

export function isCompletedSale(order: {
  paymentStatus: string;
  status: string;
}): boolean {
  return (
    order.paymentStatus === SALE_PAYMENT_STATUS && order.status !== 'cancelled'
  );
}

export const SALES_DEFINITION = {
  paymentStatus: SALE_PAYMENT_STATUS,
  excludeOrderStatus: 'cancelled',
  labelAr:
    'طلب مدفوع (paymentStatus=paid) وغير ملغى. الطلبات غير المدفوعة والمُلغاة لا تُحتسب مبيعات.',
} as const;
