import { apiClient, unwrap } from './api.client';
import type { OfficialServiceRecord } from './official-services.service';

export type MinistryAccount = {
  id: string;
  username: string;
  arabicName: string;
  displayName: string;
  bio?: string | null;
  about?: string | null;
  avatar?: string | null;
  coverImage?: string | null;
  website?: string | null;
  publicPhone?: string | null;
  publicEmail?: string | null;
  verified: boolean;
  followersCount: number;
  servicesCount: number;
};

export type MinistryPost = {
  id: string;
  content: string;
  arabicContent?: string;
  image?: string | null;
  isHidden: boolean;
  createdAt: string;
};

export async function fetchMinistryProfile() {
  const res = await apiClient.get('/admin/ministry/profile');
  return unwrap<{ account: MinistryAccount }>(res).account;
}

export async function updateMinistryProfile(
  data: Partial<
    Pick<
      MinistryAccount,
      | 'arabicName'
      | 'displayName'
      | 'bio'
      | 'about'
      | 'avatar'
      | 'coverImage'
      | 'website'
      | 'publicPhone'
      | 'publicEmail'
      | 'verified'
    >
  >,
) {
  const res = await apiClient.put('/admin/ministry/profile', data);
  return unwrap<{ account: MinistryAccount }>(res).account;
}

export async function fetchMinistryPosts() {
  const res = await apiClient.get('/admin/ministry/posts');
  return unwrap<{ posts: MinistryPost[] }>(res).posts;
}

export async function createMinistryPost(data: { content: string; image?: string }) {
  const res = await apiClient.post('/admin/ministry/posts', data);
  return unwrap<{ post: MinistryPost }>(res).post;
}

export async function updateMinistryPost(
  id: string,
  data: Partial<{ content: string; image: string; isHidden: boolean }>,
) {
  const res = await apiClient.patch(`/admin/ministry/posts/${id}`, data);
  return unwrap<{ post: MinistryPost }>(res).post;
}

export async function deleteMinistryPost(id: string) {
  const res = await apiClient.delete(`/admin/ministry/posts/${id}`);
  return unwrap(res);
}

export type { OfficialServiceRecord };
