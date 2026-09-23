import { apiClient, unwrap } from './api.client';

export type HomeExploreDestination = {
  key: string;
  titleAr: string;
  descriptionAr: string;
  icon: string;
  route: string;
  requiresPaidServices?: boolean;
};

export type HomeExploreSection = HomeExploreDestination & {
  id: string;
  destination: string;
  sortOrder: number;
  isActive: boolean;
};

export async function fetchHomeExploreAdmin() {
  const res = await apiClient.get('/admin/home-explore');
  return unwrap<{ sections: HomeExploreSection[] }>(res).sections;
}

export async function fetchHomeExploreCatalog() {
  const res = await apiClient.get('/admin/home-explore/catalog');
  return unwrap<{ destinations: HomeExploreDestination[] }>(res).destinations;
}

export async function addHomeExploreSection(destination: string) {
  const res = await apiClient.post('/admin/home-explore', { destination });
  return unwrap<{ sections: HomeExploreSection[] }>(res).sections;
}

export async function updateHomeExploreSection(
  id: string,
  data: { isActive?: boolean; sortOrder?: number },
) {
  const res = await apiClient.patch(`/admin/home-explore/${id}`, data);
  return unwrap<{ sections: HomeExploreSection[] }>(res).sections;
}

export async function reorderHomeExploreSections(orderedIds: string[]) {
  const res = await apiClient.patch('/admin/home-explore/reorder', { orderedIds });
  return unwrap<{ sections: HomeExploreSection[] }>(res).sections;
}

export async function deleteHomeExploreSection(id: string) {
  const res = await apiClient.delete(`/admin/home-explore/${id}`);
  return unwrap<{ sections: HomeExploreSection[] }>(res).sections;
}
