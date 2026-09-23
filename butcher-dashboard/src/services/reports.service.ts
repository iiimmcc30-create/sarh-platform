import { apiClient, unwrap } from './api.client';

export type ReportsPeriod = 'today' | '7d' | '30d' | 'custom';

export type ReportProductRow = {
  productId: string;
  nameAr: string;
  quantity: number;
  revenue: number;
};

export type ReportsPayload = {
  definition: {
    paymentStatus: string;
    excludeOrderStatus: string;
    labelAr: string;
  };
  period: ReportsPeriod;
  from: string;
  to: string;
  salesTotal: number;
  salesCount: number;
  avgOrderValue: number;
  orderCountInPeriod: number;
  classification: {
    unpaid: number;
    cancelled: number;
    paidPreparing: number;
    paidDelivered: number;
    sales: number;
  };
  topProducts: ReportProductRow[];
  bottomProducts: ReportProductRow[];
  daily: Array<{ date: string; total: number }>;
  weekly: Array<{ week: string; total: number }>;
  monthly: Array<{ month: string; total: number }>;
};

export async function fetchButcherReports(params: {
  period: ReportsPeriod;
  from?: string;
  to?: string;
}): Promise<ReportsPayload> {
  const res = await apiClient.get('/butchers/reports', {
    params: {
      period: params.period,
      from: params.from,
      to: params.to,
    },
  });
  return unwrap<ReportsPayload>(res);
}
