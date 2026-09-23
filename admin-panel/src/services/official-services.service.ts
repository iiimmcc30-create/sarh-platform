import { apiClient, unwrap } from './api.client';

export type OfficialServiceRecord = {
  id: string;
  title: string;
  description: string;
  category: 'veterinary' | 'livestock' | 'slaughter' | string;
  icon: string;
  externalUrl: string;
  active: boolean;
  feeText?: string | null;
  isFree?: boolean;
  steps?: string | null;
  conditions?: string | null;
  documents?: string | null;
  deliveryChannel?: string | null;
  imageUrl?: string | null;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
};

export type OfficialServicePayload = {
  title: string;
  description: string;
  category: string;
  icon: string;
  externalUrl: string;
  active?: boolean;
  feeText?: string;
  isFree?: boolean;
  steps?: string;
  conditions?: string;
  documents?: string;
  deliveryChannel?: string;
  imageUrl?: string;
  sortOrder?: number;
};

export const OFFICIAL_SERVICE_CATEGORIES = [
  { value: 'veterinary', label: 'الخدمات البيطرية' },
  { value: 'livestock', label: 'خدمات الماشية' },
  { value: 'slaughter', label: 'خدمات المسالخ' },
] as const;

export async function fetchOfficialServicesAdmin() {
  const res = await apiClient.get('/admin/services');
  return unwrap<{ services: OfficialServiceRecord[] }>(res).services;
}

export async function createOfficialService(data: OfficialServicePayload) {
  const res = await apiClient.post('/admin/services', data);
  return unwrap<{ service: OfficialServiceRecord }>(res).service;
}

export async function updateOfficialService(
  id: string,
  data: Partial<OfficialServicePayload>,
) {
  const res = await apiClient.patch(`/admin/services/${id}`, data);
  return unwrap<{ service: OfficialServiceRecord }>(res).service;
}

export async function deleteOfficialService(id: string) {
  const res = await apiClient.delete(`/admin/services/${id}`);
  return unwrap(res);
}
