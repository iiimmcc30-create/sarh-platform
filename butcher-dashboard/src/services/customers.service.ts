import { apiClient, unwrap } from './api.client';

export type ButcherCustomer = {
  customerId: string;
  name: string;
  arabicName: string | null;
  displayName: string | null;
  phone: string | null;
  avatar: string | null;
  orderCount: number;
  paidTotal: number;
  lastOrderAt: string;
  lastOrderNumber: string | null;
};

export type CustomersPage = {
  items: ButcherCustomer[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export async function fetchButcherCustomers(params: {
  page: number;
  limit: number;
  q?: string;
}): Promise<CustomersPage> {
  const res = await apiClient.get('/butchers/customers', {
    params: {
      page: String(params.page),
      limit: String(params.limit),
      q: params.q,
    },
  });
  return unwrap<CustomersPage>(res);
}
