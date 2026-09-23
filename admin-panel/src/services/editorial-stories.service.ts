import { apiClient, unwrap } from './api.client';

export type EditorialStoryRecord = {
  id: string;
  titleAr: string;
  bodyAr: string;
  imageUrl: string;
  duration: number;
  sortOrder: number;
  isActive: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function fetchEditorialStoriesAdmin() {
  const res = await apiClient.get('/admin/editorial-stories');
  return unwrap<{ stories: EditorialStoryRecord[] }>(res).stories;
}

export async function createEditorialStory(data: {
  bodyAr: string;
  imageUrl: string;
  titleAr?: string;
  duration?: number;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const res = await apiClient.post('/admin/editorial-stories', data);
  return unwrap<{ story: EditorialStoryRecord }>(res).story;
}

export async function updateEditorialStory(
  id: string,
  data: Partial<{
    titleAr: string;
    bodyAr: string;
    imageUrl: string;
    duration: number;
    sortOrder: number;
    isActive: boolean;
  }>,
) {
  const res = await apiClient.patch(`/admin/editorial-stories/${id}`, data);
  return unwrap<{ story: EditorialStoryRecord }>(res).story;
}

export async function deleteEditorialStory(id: string) {
  const res = await apiClient.delete(`/admin/editorial-stories/${id}`);
  return unwrap(res);
}
