import { apiClient, unwrap } from './api.client';
import type { OrderStatus } from '@/constants/orders';
import type { ButcherOrder } from './orders.service';

export type InventoryAlert = {
  id: string;
  nameAr: string;
  availableQuantity: number;
  reservedQuantity: number;
  sellableQuantity: number;
  inStock: boolean;
  stock: 'low' | 'out';
};

export type DashboardSummary = {
  butcher: {
    id: string;
    nameAr: string;
    nameEn: string;
    isOpen: boolean;
  };
  counts: {
    pending: number;
    confirmed: number;
    preparing: number;
    ready: number;
    delivered: number;
    cancelled: number;
    deliveredToday: number;
    cancelledToday: number;
  };
  salesToday: number;
  ordersToday: number;
  currency: string;
  inventory: {
    thresholdKg: number;
    low: InventoryAlert[];
    out: InventoryAlert[];
  };
  recentOrders: Array<
    Pick<
      ButcherOrder,
      | 'id'
      | 'orderNumber'
      | 'status'
      | 'totalPrice'
      | 'createdAt'
      | 'currency'
      | 'customer'
      | 'allowedNextStatuses'
    > & { status: OrderStatus }
  >;
};

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const res = await apiClient.get('/butchers/dashboard');
  return unwrap<DashboardSummary>(res);
}
