import { apiClient, unwrap } from './api.client';

export type ExploreSarhBannerRecord = {
  id: string;
  imageUrl: string;
  accessibilityLabel: string;
  href: string;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ExploreSarhBannerInput = {
  imageUrl: string;
  accessibilityLabel: string;
  href: string;
  isActive?: boolean;
  sortOrder?: number;
};

export async function fetchExploreSarhBannersAdmin() {
  const res = await apiClient.get('/admin/explore-sarh-banners');
  return unwrap<{ banners: ExploreSarhBannerRecord[] }>(res).banners;
}

export async function createExploreSarhBanner(data: ExploreSarhBannerInput) {
  const res = await apiClient.post('/admin/explore-sarh-banners', data);
  return unwrap<{ banner: ExploreSarhBannerRecord }>(res).banner;
}

export async function updateExploreSarhBanner(
  id: string,
  data: Partial<ExploreSarhBannerInput>,
) {
  const res = await apiClient.patch(`/admin/explore-sarh-banners/${id}`, data);
  return unwrap<{ banner: ExploreSarhBannerRecord }>(res).banner;
}

export async function reorderExploreSarhBanners(orderedIds: string[]) {
  const res = await apiClient.patch('/admin/explore-sarh-banners/reorder', {
    orderedIds,
  });
  return unwrap<{ banners: ExploreSarhBannerRecord[] }>(res).banners;
}

export async function deleteExploreSarhBanner(id: string) {
  const res = await apiClient.delete(`/admin/explore-sarh-banners/${id}`);
  return unwrap<{ id: string }>(res);
}
