export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'delivered',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'جديدة',
  confirmed: 'مقبولة',
  preparing: 'قيد التجهيز',
  ready: 'جاهزة',
  delivered: 'مكتملة',
  cancelled: 'ملغاة',
};

export function orderStatusLabel(status: string, deliveryType?: string): string {
  if (status === 'ready' && deliveryType === 'delivery') return 'جاهزة للتوصيل';
  return ORDER_STATUS_LABELS[status as OrderStatus] ?? status;
}
