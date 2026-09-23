import { apiClient, unwrap } from './api.client';

export type MarketCategory = {
  id: string;
  nameAr: string;
  nameEn?: string | null;
  slug: string;
  icon?: string | null;
  emoji?: string | null;
  parentId?: string | null;
  sortOrder: number;
  isActive: boolean;
  requiresWeight: boolean;
  legacyCategory?: string | null;
  children?: MarketCategory[];
};

export async function fetchAdminCategories() {
  const res = await apiClient.get('/admin/categories');
  return unwrap<{ categories: MarketCategory[] }>(res).categories;
}

export async function createAdminCategory(body: Record<string, unknown>) {
  const res = await apiClient.post('/admin/categories', body);
  return unwrap<{ category: MarketCategory }>(res).category;
}

export async function updateAdminCategory(id: string, body: Record<string, unknown>) {
  const res = await apiClient.patch(`/admin/categories/${id}`, body);
  return unwrap<{ category: MarketCategory }>(res).category;
}

export async function deleteAdminCategory(id: string) {
  const res = await apiClient.delete(`/admin/categories/${id}`);
  return unwrap(res);
}

export async function reorderAdminCategories(items: { id: string; sortOrder: number }[]) {
  const res = await apiClient.put('/admin/categories/reorder', { items });
  return unwrap(res);
}
