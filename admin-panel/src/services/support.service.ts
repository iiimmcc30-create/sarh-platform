import { apiClient, unwrap } from './api.client';

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  statusGroup?: string;
  category?: string;
  type?: 'SUPPORT' | 'REPORT';
};

export async function fetchSupportTickets(params: ListParams = {}) {
  const res = await apiClient.get('/admin/support/tickets', { params });
  return unwrap<Paginated<Record<string, unknown>>>(res);
}

export async function fetchSupportTicket(id: string) {
  const res = await apiClient.get(`/admin/support/tickets/${id}`);
  return unwrap<{ ticket: Record<string, unknown> }>(res);
}

export async function updateSupportTicket(id: string, body: Record<string, unknown>) {
  const res = await apiClient.patch(`/admin/support/tickets/${id}`, body);
  return unwrap<{ ticket: Record<string, unknown> }>(res);
}

export async function replySupportTicket(id: string, body: Record<string, unknown>) {
  const res = await apiClient.post(`/admin/support/tickets/${id}/messages`, body);
  return unwrap<Record<string, unknown>>(res);
}

export async function fetchSupportStaff() {
  const res = await apiClient.get('/admin/support/tickets/staff');
  return unwrap<{ staff: Record<string, unknown>[] }>(res);
}

export async function fetchVerificationRequests(params: ListParams = {}) {
  const res = await apiClient.get('/admin/support/verification', { params });
  return unwrap<Paginated<Record<string, unknown>>>(res);
}

/** Gold subscription payment linked to a verification request (document). */
export type GoldPaymentLink = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  planId: string | null;
  documentId: string | null;
};

export async function fetchVerificationRequest(id: string) {
  const res = await apiClient.get(`/admin/support/verification/${id}`);
  return unwrap<{ request: Record<string, unknown>; goldPayments?: GoldPaymentLink[] }>(res);
}

export async function updateVerificationRequest(id: string, body: Record<string, unknown>) {
  const res = await apiClient.patch(`/admin/support/verification/${id}`, body);
  return unwrap<{ request: Record<string, unknown> }>(res);
}

export async function fetchSupportFaqs(params: { search?: string; category?: string } = {}) {
  const res = await apiClient.get('/admin/support/faqs', { params });
  return unwrap<{ faqs: Record<string, unknown>[] }>(res);
}

export async function createSupportFaq(body: Record<string, unknown>) {
  const res = await apiClient.post('/admin/support/faqs', body);
  return unwrap<{ faq: Record<string, unknown> }>(res);
}

export async function updateSupportFaq(id: string, body: Record<string, unknown>) {
  const res = await apiClient.patch(`/admin/support/faqs/${id}`, body);
  return unwrap<{ faq: Record<string, unknown> }>(res);
}

export async function deleteSupportFaq(id: string) {
  const res = await apiClient.delete(`/admin/support/faqs/${id}`);
  return unwrap<{ ok: boolean }>(res);
}

export async function reorderSupportFaqs(items: { id: string; sortOrder: number }[]) {
  const res = await apiClient.put('/admin/support/faqs/reorder', { items });
  return unwrap<{ ok: boolean }>(res);
}

export type ServiceStatus = {
  state: 'ok' | 'degraded';
  textAr: string;
  updatedAt: string | null;
};

export async function fetchServiceStatus() {
  const res = await apiClient.get('/admin/support/status');
  return unwrap<ServiceStatus>(res);
}

export async function updateServiceStatus(body: { state: 'ok' | 'degraded'; textAr?: string }) {
  const res = await apiClient.put('/admin/support/status', body);
  return unwrap<ServiceStatus>(res);
}

export type AiFlagRow = {
  name: string;
  envAllows: boolean;
  runtimeOff: boolean;
  effective: boolean;
};

export type AiDashboard = {
  flags: AiFlagRow[];
  usage: {
    day: string;
    tokens: number;
    requests: number;
    tokenBudget: number;
    requestLimit: number;
  };
  outcomes: { answered: number; escalated: number; fallback: number; error: number };
  audit: Array<{ tool: string; status: string; resultSummary: string; actorKind: string }>;
  drafts: Array<{ severity: string; service: string; cause: string; fix: string }>;
};

export async function fetchAiDashboard() {
  const res = await apiClient.get('/admin/support/ai');
  return unwrap<AiDashboard>(res);
}

export async function setAiFlag(name: string, enabled: boolean) {
  const res = await apiClient.post('/admin/support/ai/flags', { name, enabled });
  return unwrap<{ ok: boolean; reason?: string; effective: boolean }>(res);
}
