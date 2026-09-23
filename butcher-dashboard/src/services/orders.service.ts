import { apiClient, unwrap } from './api.client';
import type { OrderStatus } from '@/constants/orders';

export type OrderCustomer = {
  id: string;
  displayName: string;
  arabicName: string;
  avatar: string | null;
  phone?: string | null;
};

export type OrderProduct = {
  id: string;
  nameAr: string;
  images?: string[];
  saleUnit?: string | null;
  daftraLink?: { daftraSaleUnit?: string | null } | null;
};

export type OrderItem = {
  id: string;
  productId: string;
  cutType: string;
  weightKg: number;
  linePrice: number;
  reservedQuantity?: number;
  product?: OrderProduct;
};

export type OrderTimelineEntry = {
  id: string;
  status: OrderStatus;
  note: string | null;
  createdAt: string;
  createdBy?: string;
};

export type OrderAuditEntry = {
  id: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  changedBy: string;
  changedAt: string;
};

export type ButcherOrder = {
  id: string;
  orderNumber: string;
  butcherId: string;
  customerId: string;
  productId: string;
  cutType: string;
  weightKg: number;
  reservedQuantity?: number;
  deliveryType: string;
  deliveryAddress?: string | null;
  status: OrderStatus;
  paymentStatus: string;
  totalPrice: number;
  currency: string;
  notes?: string | null;
  createdAt: string;
  updatedAt?: string;
  customer?: OrderCustomer;
  product?: OrderProduct;
  items?: OrderItem[];
  timeline?: OrderTimelineEntry[];
  audits?: OrderAuditEntry[];
  allowedNextStatuses?: OrderStatus[];
};

export type PagedOrders = {
  items: ButcherOrder[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type OrdersQuery = {
  page?: number;
  limit?: number;
  status?: OrderStatus | '';
  q?: string;
  from?: string;
  to?: string;
};

export async function fetchButcherOrders(query: OrdersQuery): Promise<PagedOrders> {
  const params: Record<string, string | number> = {
    page: query.page ?? 1,
    limit: query.limit ?? 20,
  };
  if (query.status) params.status = query.status;
  if (query.q) params.q = query.q;
  if (query.from) params.from = query.from;
  if (query.to) params.to = query.to;
  const res = await apiClient.get('/butchers/orders', { params });
  return unwrap<PagedOrders>(res);
}

export async function fetchButcherOrder(id: string): Promise<ButcherOrder> {
  const res = await apiClient.get(`/butchers/orders/${id}`);
  return unwrap<ButcherOrder>(res);
}

export async function updateButcherOrderStatus(
  id: string,
  status: OrderStatus,
  cancellationReason?: string,
): Promise<ButcherOrder> {
  const res = await apiClient.put(`/butchers/orders/${id}`, {
    status,
    ...(status === 'cancelled' && cancellationReason
      ? { cancellationReason }
      : {}),
  });
  return unwrap<ButcherOrder>(res);
}
