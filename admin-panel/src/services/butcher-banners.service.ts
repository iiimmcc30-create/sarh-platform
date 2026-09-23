import { apiClient, unwrap } from './api.client';

export type ButcherBannerRecord = {
  id: string;
  slot: number;
  titleAr: string;
  subtitleAr: string;
  captionAr: string;
  imageUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function fetchButcherBannersAdmin() {
  const res = await apiClient.get('/admin/butcher-banners');
  return unwrap<{ banners: ButcherBannerRecord[] }>(res).banners;
}

export async function updateButcherBanner(
  id: string,
  data: Partial<{
    titleAr: string;
    subtitleAr: string;
    captionAr: string;
    imageUrl: string;
    isActive: boolean;
  }>,
) {
  const res = await apiClient.patch(`/admin/butcher-banners/${id}`, data);
  return unwrap<{ banner: ButcherBannerRecord }>(res).banner;
}
