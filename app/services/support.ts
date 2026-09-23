import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import { parseApiError } from '@/services/apiError';

export type SupportTicketCategory =
  | 'ACCOUNT'
  | 'ADS'
  | 'MARKET'
  | 'BUY_SELL'
  | 'PAYMENT'
  | 'VERIFICATION'
  | 'BUTCHERS'
  | 'TECHNICAL'
  | 'OTHER'
  | 'ORDER_HELP'
  | 'OTHER_HELP';

export type SupportTicketStatus =
  | 'OPEN'
  | 'IN_REVIEW'
  | 'AI_ASSISTING'
  | 'WAITING_FOR_CUSTOMER'
  | 'WAITING_FOR_SUPPORT'
  | 'IN_PROGRESS'
  | 'AWAITING_USER'
  | 'RESOLVED'
  | 'CLOSED';

export type FaqCategory =
  | 'ACCOUNT'
  | 'ADS'
  | 'MARKET'
  | 'BUY_SELL'
  | 'PAYMENT'
  | 'VERIFICATION'
  | 'BUTCHERS'
  | 'TECHNICAL'
  | 'GENERAL';

export type SupportTicketSummary = {
  id: string;
  ticketNumber: string;
  category: string;
  status: SupportTicketStatus;
  subject: string;
  createdAt: string;
  updatedAt: string;
};

export type SupportTicketAttachment = {
  id: string;
  fileUrl: string;
  fileName?: string | null;
  mimeType?: string | null;
};

export type SupportTicketMessage = {
  id: string;
  body: string;
  isStaffReply: boolean;
  authorKind?: 'CUSTOMER' | 'SARHAN' | 'STAFF';
  createdAt: string;
  author?: {
    id: string;
    displayName?: string;
    arabicName?: string;
    role?: string;
  };
  attachments?: SupportTicketAttachment[];
};

export type SupportTicketDetail = SupportTicketSummary & {
  description: string;
  handlerMode?: 'AI_ACTIVE' | 'HUMAN_ACTIVE';
  metadata?: Record<string, unknown> | null;
  order?: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    totalPrice: number;
    currency?: string;
  } | null;
  attachments?: SupportTicketAttachment[];
  messages?: SupportTicketMessage[];
};

export type HelpOrderSummary = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totalPrice: number;
  currency: string;
  createdAt: string;
  butcher?: { nameAr?: string | null } | null;
};

export type FaqItem = {
  id: string;
  questionAr: string;
  answerAr: string;
  category: FaqCategory;
  sortOrder: number;
};

export type VerificationDocument = {
  id: string;
  type: 'NATIONAL_ID' | 'COMMERCIAL_REGISTER' | 'OTHER';
  fileUrl: string;
  originalFileName?: string | null;
};

export type VerificationRequest = {
  id: string;
  status: 'DRAFT' | 'UNDER_REVIEW' | 'NEEDS_AMENDMENTS' | 'VERIFIED' | 'REJECTED';
  fullName?: string | null;
  nationalId?: string | null;
  businessName?: string | null;
  businessType?: string | null;
  additionalInfo?: string | null;
  reviewReason?: string | null;
  submittedAt?: string | null;
  documents?: VerificationDocument[];
};

type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

async function parseEnvelope<T>(res: Response): Promise<T | null> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    throw new Error(json.messageAr || json.message || (await parseApiError(res)));
  }
  return json.data as T;
}

export async function fetchSupportMeta(): Promise<{
  tickets: { categories: { value: string; labelAr: string }[]; statuses: { value: string; labelAr: string }[] };
  verification: { requirements: string[]; documentTypes: { value: string; labelAr: string }[] };
  faq: { categories: { value: string; labelAr: string }[] };
} | null> {
  const res = await fetch(`${API_BASE}/api/support/meta`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.success ? json.data : null;
}

export async function fetchFaqs(params?: { search?: string; category?: string }): Promise<{
  faqs: FaqItem[];
  categories: { value: string; labelAr: string }[];
} | null> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.category) qs.set('category', params.category);
  const res = await fetch(`${API_BASE}/api/support/faqs?${qs.toString()}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.success ? json.data : null;
}

export async function fetchMyTickets(page = 1): Promise<Paginated<SupportTicketSummary> | null> {
  const res = await authFetch(`${API_BASE}/api/support/tickets?page=${page}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.success ? json.data : null;
}

export async function fetchTicket(id: string): Promise<SupportTicketDetail | null> {
  const res = await authFetch(`${API_BASE}/api/support/tickets/${id}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.success ? json.data.ticket : null;
}

export async function fetchMyHelpOrders(): Promise<{ orders: HelpOrderSummary[] } | null> {
  const res = await authFetch(`${API_BASE}/api/support/help-orders`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.success ? json.data : null;
}

export async function createTicket(payload: {
  category?: SupportTicketCategory;
  subject?: string;
  description: string;
  helpKind?: 'ORDER_HELP' | 'OTHER_HELP';
  orderId?: string;
  attachments?: { fileUrl: string; fileName?: string; mimeType?: string; fileSizeBytes?: number }[];
}): Promise<{ ok: boolean; ticket?: { id: string; ticketNumber: string }; error?: string }> {
  const res = await authFetch(`${API_BASE}/api/support/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.ok) {
    const json = await res.json();
    return { ok: true, ticket: json.data?.ticket };
  }
  return { ok: false, error: await parseApiError(res) };
}

export async function replyToTicket(
  ticketId: string,
  body: string,
  attachments?: { fileUrl: string; fileName?: string; mimeType?: string }[],
): Promise<{ ok: boolean; error?: string }> {
  const res = await authFetch(`${API_BASE}/api/support/tickets/${ticketId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, attachments }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: await parseApiError(res) };
}

export async function fetchVerificationRequest(): Promise<{
  request: VerificationRequest;
  userVerified: boolean;
} | null> {
  const res = await authFetch(`${API_BASE}/api/support/verification`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.success ? json.data : null;
}

export async function saveVerificationDraft(payload: {
  fullName?: string;
  nationalId?: string;
  businessName?: string;
  businessType?: string;
  additionalInfo?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await authFetch(`${API_BASE}/api/support/verification`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: await parseApiError(res) };
}

export async function addVerificationDocument(payload: {
  type: 'NATIONAL_ID' | 'COMMERCIAL_REGISTER' | 'OTHER';
  fileKey: string;
  fileUrl: string;
  originalFileName?: string;
  mimeType?: string;
  fileSizeBytes?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await authFetch(`${API_BASE}/api/support/verification/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: await parseApiError(res) };
}

export async function removeVerificationDocument(documentId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await authFetch(`${API_BASE}/api/support/verification/documents/${documentId}`, {
    method: 'DELETE',
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: await parseApiError(res) };
}

export async function submitVerificationRequest(): Promise<{ ok: boolean; error?: string }> {
  const res = await authFetch(`${API_BASE}/api/support/verification/submit`, { method: 'POST' });
  if (res.ok) return { ok: true };
  return { ok: false, error: await parseApiError(res) };
}

export const TICKET_STATUS_LABEL_AR: Record<SupportTicketStatus, string> = {
  OPEN: 'جديدة',
  IN_REVIEW: 'قيد المراجعة',
  AI_ASSISTING: 'سرحان يساعد',
  WAITING_FOR_CUSTOMER: 'بانتظار ردك',
  WAITING_FOR_SUPPORT: 'بانتظار خدمة العملاء',
  IN_PROGRESS: 'قيد المعالجة',
  AWAITING_USER: 'بانتظار ردك',
  RESOLVED: 'تم الحل',
  CLOSED: 'مغلقة',
};

export const VERIFICATION_STATUS_LABEL_AR: Record<VerificationRequest['status'], string> = {
  DRAFT: 'لم يتم التقديم',
  UNDER_REVIEW: 'قيد المراجعة',
  NEEDS_AMENDMENTS: 'يحتاج تعديلات',
  VERIFIED: 'موثق',
  REJECTED: 'مرفوض',
};

export const FAQ_CATEGORY_LABEL_AR: Record<FaqCategory, string> = {
  ACCOUNT: 'الحساب',
  ADS: 'الإعلانات',
  MARKET: 'السوق',
  BUY_SELL: 'البيع والشراء',
  PAYMENT: 'الدفع',
  VERIFICATION: 'التوثيق',
  BUTCHERS: 'الملاحم',
  TECHNICAL: 'المشاكل التقنية',
  GENERAL: 'عام',
};

export const TICKET_CATEGORY_LABEL_AR: Record<SupportTicketCategory, string> = {
  ACCOUNT: 'الحساب',
  ADS: 'الإعلانات',
  MARKET: 'السوق',
  BUY_SELL: 'البيع والشراء',
  PAYMENT: 'الدفع',
  VERIFICATION: 'التوثيق',
  BUTCHERS: 'الملاحم',
  TECHNICAL: 'المشاكل التقنية',
  OTHER: 'أخرى',
  ORDER_HELP: 'مشكلة في الطلب',
  OTHER_HELP: 'مساعدة في شيء آخر',
};
