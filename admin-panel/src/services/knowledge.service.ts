import { apiClient, unwrap } from './api.client';

export type KnowledgeSource = {
  id: string;
  name: string;
  url: string;
  type: 'RSS' | 'API';
  enabled: boolean;
  createdAt: string;
};

export type KnowledgeArticle = {
  id: string;
  sourceId: string;
  originalTitle: string;
  originalUrl: string;
  summary: string | null;
  titleAr: string | null;
  publishedAt: string | null;
  status: 'PENDING' | 'PUBLISHED' | 'REJECTED';
  postId: string | null;
  source?: { id: string; name: string };
};

export type KnowledgeSyncLog = {
  id: string;
  sourceId: string | null;
  level: string;
  message: string;
  createdAt: string;
  source?: { id: string; name: string } | null;
};

export async function fetchKnowledgeSources() {
  const res = await apiClient.get('/admin/knowledge/sources');
  return unwrap<{ sources: KnowledgeSource[] }>(res).sources;
}

export async function createKnowledgeSource(data: {
  name: string;
  url: string;
  type: 'RSS' | 'API';
  enabled?: boolean;
}) {
  const res = await apiClient.post('/admin/knowledge/sources', data);
  return unwrap<{ source: KnowledgeSource }>(res).source;
}

export async function deleteKnowledgeSource(id: string) {
  const res = await apiClient.delete(`/admin/knowledge/sources/${id}`);
  return unwrap(res);
}

export async function setKnowledgeSourceEnabled(id: string, enabled: boolean) {
  const res = await apiClient.post(
    `/admin/knowledge/sources/${id}/${enabled ? 'enable' : 'disable'}`,
  );
  return unwrap<{ source: KnowledgeSource }>(res).source;
}

export async function syncKnowledge() {
  const res = await apiClient.post('/admin/knowledge/sync');
  return unwrap(res);
}

export async function activateKnowledgeCenter(options?: { sync?: boolean }) {
  const res = await apiClient.post('/admin/knowledge/activate', {
    sync: options?.sync !== false,
  });
  return unwrap<{
    user: {
      id: string;
      username: string;
      arabicName: string | null;
      isAI: boolean;
      verified: boolean;
      isActive: boolean;
    };
    sources: { seeded: number; total: number };
    follows: { users: number; followsCreated: number };
    sourcesEnabled: number;
    sync: Record<string, number> | null;
  }>(res);
}

export async function syncKnowledgeSource(id: string) {
  const res = await apiClient.post(`/admin/knowledge/sources/${id}/sync`);
  return unwrap(res);
}

export async function fetchKnowledgeArticles(params: {
  status?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const res = await apiClient.get('/admin/knowledge/articles', { params });
  return unwrap<{
    items: KnowledgeArticle[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>(res);
}

export async function approveKnowledgeArticle(id: string) {
  const res = await apiClient.post(`/admin/knowledge/articles/${id}/approve`);
  return unwrap(res);
}

export async function rejectKnowledgeArticle(id: string, reason?: string) {
  const res = await apiClient.post(`/admin/knowledge/articles/${id}/reject`, {
    reason,
  });
  return unwrap(res);
}

export async function publishKnowledgeArticle(id: string) {
  const res = await apiClient.post(`/admin/knowledge/articles/${id}/publish`);
  return unwrap(res);
}

export async function fetchKnowledgeLogs(params: {
  page?: number;
  pageSize?: number;
} = {}) {
  const res = await apiClient.get('/admin/knowledge/logs', { params });
  return unwrap<{
    items: KnowledgeSyncLog[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>(res);
}

export type KnowledgeProfile = {
  id: string;
  username: string;
  arabicName: string | null;
  displayName: string;
  avatar: string | null;
  bio: string | null;
  isAI: boolean;
  verified: boolean;
  isActive: boolean;
} | null;

export async function fetchKnowledgeProfile() {
  const res = await apiClient.get('/admin/knowledge/profile');
  return unwrap<{ user: KnowledgeProfile }>(res).user;
}

export async function updateKnowledgeProfile(data: {
  avatar?: string;
  bio?: string;
}) {
  const res = await apiClient.put('/admin/knowledge/profile', data);
  return unwrap<{ user: KnowledgeProfile }>(res).user;
}

export async function createKnowledgePost(data: {
  content: string;
  imageUrl?: string;
}) {
  const res = await apiClient.post('/admin/knowledge/post', data);
  return unwrap<{ post: Record<string, unknown> }>(res).post;
}
