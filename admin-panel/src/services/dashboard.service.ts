import { apiClient, unwrap } from './api.client';

export type DeltaStat = {
  today: number;
  yesterday?: number;
};

export type DashboardStats = {
  users: {
    total: number;
    active: number;
    banned: number;
    newToday: number;
    newYesterday?: number;
    newLast7Days?: number;
  };
  posts: { total: number; hidden: number };
  listings: {
    total: number;
    active: number;
    suspended: number;
    newToday?: number;
    newYesterday?: number;
    newLast7Days?: number;
  };
  liveStreams: { total: number; liveNow: number };
  tickets: {
    open: number;
    urgent: number;
    total: number;
    today?: number;
    yesterday?: number;
  };
  butchers: { total: number; verified: number };
  orders?: {
    total: number;
    today: number;
    yesterday: number;
    pending: number;
    completed: number;
  };
  sales?: {
    today: number;
    yesterday: number;
    last7Days: number;
    last30Days: number;
  };
  payments?: {
    successful: number;
    failed: number;
    pending: number;
    refunded: number;
  };
  commission?: {
    listingCommissionRatePercent?: number;
    orderCommissionRatePercent?: number;
    /** @deprecated Use listingCommissionRatePercent */
    butcherStoreRatePercent: number;
    listingFeesPaidTotal: number;
    listingFeesPaidCount: number;
    listingFeesOutstandingTotal: number;
    listingFeesOutstandingCount: number;
    orderCommissionsTotal?: number;
    orderCommissionsCount?: number;
    totalCommission?: number;
    noteAr: string;
  };
  charts: {
    usersByDay: { date: string; count: number }[];
    usersByDay30?: { date: string; count: number }[];
    salesByDay?: { date: string; amount: number }[];
    salesByDay30?: { date: string; amount: number }[];
    ordersByDay?: { date: string; count: number }[];
    paymentsByDay?: { date: string; paid: number; failed: number }[];
    reportsByDay?: { date: string; count: number }[];
    ticketsByCategory: { category: string; count: number }[];
  };
  recent?: {
    orders: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
    reports: Array<Record<string, unknown>>;
  };
};

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await apiClient.get('/admin/dashboard/stats');
  return unwrap(res);
}

export type HealthPayload = {
  status: string;
  checks?: {
    db?: boolean;
    redis_cache?: boolean;
    redis_session?: boolean;
    queue?: boolean;
    worker?: boolean;
  };
  duration?: string;
  uptime?: number;
  timestamp?: string;
  version?: string;
  build?: string;
};

/** Public health endpoint — no secrets in response. */
export async function fetchSystemHealth(): Promise<HealthPayload> {
  const res = await apiClient.get('/health');
  return res.data as HealthPayload;
}
