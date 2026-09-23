import { apiClient, unwrap } from './api.client';
import { cleanListParams, type Paginated } from './admin.service';

export type IntegrationPaymentRow = {
  id: string;
  provider: string;
  status: string;
  merchantOrderReference?: string;
  externalOrderId?: string | null;
  createdAt: string;
  payment?: {
    id: string;
    orderId: string;
    status: string;
    amount: number;
    currency?: string;
    method?: string;
    referenceType?: string | null;
    transactionId?: string | null;
    metadata?: { needsReconciliation?: boolean } | null;
    createdAt?: string;
    user?: {
      id: string;
      arabicName?: string | null;
      displayName?: string | null;
      phone?: string | null;
    };
  } | null;
};

/** READ-ONLY — uses existing GET /admin/integrations */
export async function fetchPaymentIntegrations(
  params: { page?: number; pageSize?: number; status?: string } = {},
) {
  const res = await apiClient.get('/admin/integrations', {
    params: cleanListParams(params),
  });
  return unwrap<Paginated<IntegrationPaymentRow>>(res);
}
