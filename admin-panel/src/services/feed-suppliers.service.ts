import { apiClient, unwrap } from './api.client';

export const FEED_PRODUCT_CATEGORIES = [
  { value: 'livestock', label: 'أعلاف مواشي' },
  { value: 'sheep', label: 'أعلاف أغنام' },
  { value: 'camels', label: 'أعلاف إبل' },
  { value: 'poultry', label: 'أعلاف دواجن' },
  { value: 'hay', label: 'تبن' },
  { value: 'barley', label: 'شعير' },
] as const;

export type FeedProductCategory = (typeof FEED_PRODUCT_CATEGORIES)[number]['value'];

export type FeedProductRecord = {
  id: string;
  supplierId: string;
  nameAr: string;
  description?: string | null;
  category: FeedProductCategory;
  imageUrl?: string | null;
  weightLabel?: string | null;
  available: boolean;
  published: boolean;
};

export type FeedSupplierRecord = {
  id: string;
  nameAr: string;
  logo?: string | null;
  cover?: string | null;
  description?: string | null;
  cityAr: string;
  districtAr?: string | null;
  addressAr?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  hoursAr?: string | null;
  verified: boolean;
  published: boolean;
  products?: FeedProductRecord[];
  _count?: { products: number };
};

export type FeedSupplierPayload = {
  nameAr: string;
  cityAr: string;
  logo?: string | null;
  cover?: string | null;
  description?: string;
  districtAr?: string;
  addressAr?: string;
  lat?: number | null;
  lng?: number | null;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  hoursAr?: string;
  verified?: boolean;
  published?: boolean;
};

export type FeedProductPayload = {
  nameAr: string;
  category: FeedProductCategory;
  description?: string;
  imageUrl?: string | null;
  weightLabel?: string;
  available?: boolean;
  published?: boolean;
};

export async function fetchFeedSuppliersAdmin(q?: string) {
  const res = await apiClient.get('/admin/feed-suppliers', { params: q ? { q } : undefined });
  return unwrap<{ suppliers: FeedSupplierRecord[] }>(res).suppliers;
}

export async function fetchFeedSupplierAdmin(id: string) {
  const res = await apiClient.get(`/admin/feed-suppliers/${id}`);
  return unwrap<{ supplier: FeedSupplierRecord }>(res).supplier;
}

export async function createFeedSupplier(data: FeedSupplierPayload) {
  const res = await apiClient.post('/admin/feed-suppliers', data);
  return unwrap<{ supplier: FeedSupplierRecord }>(res).supplier;
}

export async function updateFeedSupplier(id: string, data: Partial<FeedSupplierPayload>) {
  const res = await apiClient.patch(`/admin/feed-suppliers/${id}`, data);
  return unwrap<{ supplier: FeedSupplierRecord }>(res).supplier;
}

export async function deleteFeedSupplier(id: string) {
  const res = await apiClient.delete(`/admin/feed-suppliers/${id}`);
  return unwrap(res);
}

export async function createFeedProduct(supplierId: string, data: FeedProductPayload) {
  const res = await apiClient.post(`/admin/feed-suppliers/${supplierId}/products`, data);
  return unwrap<{ product: FeedProductRecord }>(res).product;
}

export async function updateFeedProduct(id: string, data: Partial<FeedProductPayload>) {
  const res = await apiClient.patch(`/admin/feed-products/${id}`, data);
  return unwrap<{ product: FeedProductRecord }>(res).product;
}

export async function deleteFeedProduct(id: string) {
  const res = await apiClient.delete(`/admin/feed-products/${id}`);
  return unwrap(res);
}
