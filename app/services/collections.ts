// «المجموعات» — API client. Feed rows go through the same mappers as the main feeds
// (mapPostFromApi / mapListing) so PostItem and ListingCard render them unchanged.
import { API_BASE } from '@/services/api';
import { parseApiError } from '@/services/apiError';
import { authFetch, getAccessToken } from '@/services/authFetch';
import { mapListing } from '@/services/listings';
import { mapPostFromApi } from '@/services/posts';
import type { Listing, Post } from '@/services/types';
import { uploadImageFromUri } from '@/services/upload';

export type CollectionType = 'POSTS' | 'ADS';

export type CollectionUser = {
  id: string;
  username: string;
  displayName: string;
  arabicName: string;
  avatar?: string | null;
  verified: boolean;
  verifiedTier?: string | null;
};

export type Collection = {
  id: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  type: CollectionType;
  createdAt: string;
  updatedAt: string;
  owner: CollectionUser;
  membersCount: number;
  followersCount: number;
  isFollowing: boolean;
  isOwner: boolean;
};

export type CollectionsPage = {
  collections: Collection[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type CollectionUsersPage = {
  users: CollectionUser[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type CollectionCandidate = CollectionUser & { isMember: boolean };

export type CollectionFeedPage =
  | { type: 'POSTS'; posts: Post[]; nextCursor: string | null; hasMore: boolean }
  | { type: 'ADS'; listings: Listing[]; nextCursor: string | null; hasMore: boolean };

export type CollectionInput = {
  name: string;
  description?: string;
  coverUrl?: string | null;
  type: CollectionType;
};

/** Same limits as the backend DTO. */
export const COLLECTION_NAME_MIN = 2;
export const COLLECTION_NAME_MAX = 60;
export const COLLECTION_DESCRIPTION_MAX = 300;

/** Covers reuse the profile-cover upload convention (Cloudinary via /api/upload). */
export const COLLECTION_COVER_UPLOAD_FOLDER: Parameters<typeof uploadImageFromUri>[2] = 'avatars';

export const COLLECTION_TYPE_LABELS: Record<CollectionType, string> = {
  POSTS: 'منشورات',
  ADS: 'إعلانات',
};

export const COLLECTIONS_EMPTY_TEXT = 'لا توجد مجموعات حتى الآن';
export const COLLECTIONS_NO_MATCH_TEXT = 'لم نعثر على مجموعات مطابقة';
export const COLLECTION_NO_MEMBERS_TEXT = 'لم تتم إضافة أي حسابات بعد';
export const COLLECTION_EMPTY_FEED_TEXT = 'لا يوجد محتوى جديد من أعضاء هذه المجموعة';

const BASE = `${API_BASE}/api/collections`;
const NO_STORE: RequestInit = { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } };

export function isValidCollectionName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= COLLECTION_NAME_MIN && trimmed.length <= COLLECTION_NAME_MAX;
}

export function formatCollectionCount(n: number): string {
  return Math.max(0, Math.floor(n || 0)).toLocaleString('en-US');
}

export function collectionMembersLabel(n: number): string {
  return `${formatCollectionCount(n)} عضو`;
}

export function collectionFollowersLabel(n: number): string {
  return `${formatCollectionCount(n)} متابع`;
}

export function collectionOwnerName(user: Pick<CollectionUser, 'arabicName' | 'displayName' | 'username'>) {
  return user.arabicName || user.displayName || user.username;
}

export function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  if (existing.length === 0) return incoming;
  const seen = new Set(existing.map((row) => row.id));
  const extra = incoming.filter((row) => !seen.has(row.id));
  return extra.length === 0 ? existing : [...existing, ...extra];
}

function withCursor(url: string, cursor?: string | null) {
  if (!cursor) return url;
  return `${url}${url.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cursor)}`;
}

async function request<T>(url: string, init: RequestInit = NO_STORE): Promise<T> {
  const res = await authFetch(url, init);
  if (!res.ok) throw new Error(await parseApiError(res));
  const json = await res.json();
  if (!json?.success) throw new Error('تعذّر إكمال الطلب، حاول مرة أخرى');
  return json.data as T;
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

export function fetchSuggestedCollections(cursor?: string | null) {
  return request<CollectionsPage>(withCursor(`${BASE}/suggested`, cursor));
}

export function fetchMyCollections(cursor?: string | null) {
  return request<CollectionsPage>(withCursor(`${BASE}/mine`, cursor));
}

/** «المجموعات المضاف إليها»: collections where `userId` is a member (loaded on demand). */
export function fetchMemberOfCollections(userId: string, cursor?: string | null) {
  return request<CollectionsPage>(withCursor(`${BASE}/member-of/${encodeURIComponent(userId)}`, cursor));
}

/** Profile ••• menu label. */
export const MEMBER_OF_TITLE = 'المجموعات المضاف إليها';
/** Section title on the Collections page (hidden when empty). */
export const MEMBER_OF_SECTION_TITLE = 'المضاف إليها';

export function searchCollections(q: string, cursor?: string | null) {
  return request<CollectionsPage>(withCursor(`${BASE}/search?q=${encodeURIComponent(q.trim())}`, cursor));
}

export function fetchCollection(id: string) {
  return request<Collection>(`${BASE}/${encodeURIComponent(id)}`);
}

export function createCollection(input: CollectionInput) {
  return request<Collection>(BASE, jsonInit('POST', input));
}

export function updateCollection(id: string, patch: Partial<CollectionInput>) {
  return request<Collection>(`${BASE}/${encodeURIComponent(id)}`, jsonInit('PATCH', patch));
}

export function deleteCollection(id: string) {
  return request<{ deleted: boolean }>(`${BASE}/${encodeURIComponent(id)}`, jsonInit('DELETE'));
}

export async function fetchCollectionFeed(id: string, cursor?: string | null): Promise<CollectionFeedPage> {
  const data = await request<{
    type: CollectionType;
    posts?: Record<string, unknown>[];
    listings?: Record<string, unknown>[];
    nextCursor: string | null;
    hasMore: boolean;
  }>(withCursor(`${BASE}/${encodeURIComponent(id)}/feed`, cursor));
  const nextCursor = typeof data.nextCursor === 'string' ? data.nextCursor : null;
  const hasMore = data.hasMore === true;
  if (data.type === 'ADS') {
    return {
      type: 'ADS',
      listings: (data.listings ?? []).map((row) => mapListing(row as Parameters<typeof mapListing>[0])),
      nextCursor,
      hasMore,
    };
  }
  return {
    type: 'POSTS',
    posts: (data.posts ?? []).map((row) => mapPostFromApi(row)).filter((p): p is Post => Boolean(p)),
    nextCursor,
    hasMore,
  };
}

export function fetchCollectionMembers(id: string, cursor?: string | null) {
  return request<CollectionUsersPage>(withCursor(`${BASE}/${encodeURIComponent(id)}/members`, cursor));
}

/** Adds an account; an account that is already a member counts as added (no duplicate). */
export async function addCollectionMember(id: string, userId: string): Promise<{ membersCount?: number }> {
  const res = await authFetch(`${BASE}/${encodeURIComponent(id)}/members`, jsonInit('POST', { userId }));
  if (res.status === 409) return {};
  if (!res.ok) throw new Error(await parseApiError(res));
  const json = await res.json();
  return { membersCount: json?.data?.membersCount };
}

export function removeCollectionMember(id: string, userId: string) {
  return request<{ removed: boolean; membersCount: number }>(
    `${BASE}/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
    jsonInit('DELETE'),
  );
}

export function searchCollectionUsers(q: string, collectionId?: string) {
  const params = [`q=${encodeURIComponent(q.trim())}`];
  if (collectionId) params.push(`collectionId=${encodeURIComponent(collectionId)}`);
  return request<{ users: CollectionCandidate[] }>(`${BASE}/users/search?${params.join('&')}`);
}

export function setFollowCollection(id: string, following: boolean) {
  return request<{ following: boolean; followersCount: number }>(
    `${BASE}/${encodeURIComponent(id)}/follow`,
    jsonInit(following ? 'POST' : 'DELETE'),
  );
}

export function setBlockCollection(id: string, blocked: boolean) {
  return request<{ blocked: boolean }>(
    `${BASE}/${encodeURIComponent(id)}/block`,
    jsonInit(blocked ? 'POST' : 'DELETE'),
  );
}

/** Uploads a gallery image as a collection cover; returns the hosted URL. */
export async function uploadCollectionCover(localUri: string, fallbackToken?: string | null): Promise<string> {
  const token = getAccessToken() ?? fallbackToken ?? '';
  if (!token) throw new Error('يجب تسجيل الدخول لرفع الصورة');
  return uploadImageFromUri(token, localUri, COLLECTION_COVER_UPLOAD_FOLDER);
}
