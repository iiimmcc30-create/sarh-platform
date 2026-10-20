import { API_BASE } from '@/services/api';
import { parseApiError } from '@/services/apiError';
import { authFetch } from '@/services/authFetch';

export type ReviewPerson = {
  id: string;
  username: string;
  displayName: string;
  arabicName: string;
  avatar: string | null;
};

export type UserReviewCard = {
  id: string;
  rating: number;
  comment: string;
  purchased: boolean;
  recommend: boolean;
  createdAt: string;
  reviewer: ReviewPerson;
};

export type UserReviewsPage = {
  target: ReviewPerson;
  average: number | null;
  reviewCount: number;
  positiveCount: number;
  negativeCount: number;
  reviews: UserReviewCard[];
  nextCursor: string | null;
  hasMore: boolean;
  myReviewId: string | null;
};

export type CreateReviewInput = {
  rating: number;
  purchased: boolean;
  recommend: boolean;
  comment: string;
  oathAccepted: true;
};

function isPerson(value: unknown): value is ReviewPerson {
  if (!value || typeof value !== 'object') return false;
  const row = value as ReviewPerson;
  return typeof row.id === 'string' && typeof row.username === 'string';
}

function parsePage(data: unknown): UserReviewsPage | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as UserReviewsPage;
  if (!isPerson(row.target) || !Array.isArray(row.reviews)) return null;
  return {
    target: row.target,
    average: typeof row.average === 'number' ? row.average : null,
    reviewCount: typeof row.reviewCount === 'number' ? row.reviewCount : 0,
    positiveCount: typeof row.positiveCount === 'number' ? row.positiveCount : 0,
    negativeCount: typeof row.negativeCount === 'number' ? row.negativeCount : 0,
    reviews: row.reviews.filter((item) => item && typeof item.id === 'string' && isPerson(item.reviewer)),
    nextCursor: typeof row.nextCursor === 'string' ? row.nextCursor : null,
    hasMore: row.hasMore === true,
    myReviewId: typeof row.myReviewId === 'string' ? row.myReviewId : null,
  };
}

export async function fetchUserReviews(
  userId: string,
  cursor?: string | null,
): Promise<UserReviewsPage | null> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', '15');
  const qs = params.toString();
  const res = await authFetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}/reviews?${qs}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  if (!json?.success) return null;
  return parsePage(json.data);
}

export async function createUserReview(
  userId: string,
  input: CreateReviewInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await authFetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (res.ok) return { ok: true };
    return { ok: false, message: await parseApiError(res) };
  } catch {
    return { ok: false, message: 'تعذّر الاتصال بالخادم' };
  }
}
