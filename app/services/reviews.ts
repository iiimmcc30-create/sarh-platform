import { API_BASE } from '@/services/api';
import { parseApiError } from '@/services/apiError';
import { authFetch } from '@/services/authFetch';

export type ReviewAuthor = {
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
  legacy: boolean;
  createdAt: string;
  reviewer: ReviewAuthor;
};

export type UserReviewsPage = {
  target: ReviewAuthor;
  average: number | null;
  reviewCount: number;
  positiveCount: number;
  negativeCount: number;
  viewerHasReviewed: boolean;
  reviews: UserReviewCard[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type CreateReviewInput = {
  rating: number;
  purchased: boolean;
  recommend: boolean;
  comment: string;
  oathAccepted: true;
};

async function readError(res: Response): Promise<string> {
  return parseApiError(res);
}

export async function fetchUserReviews(
  userId: string,
  cursor?: string | null,
): Promise<UserReviewsPage | null> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', '15');
  const qs = params.toString();
  const res = await authFetch(`${API_BASE}/api/users/${userId}/reviews?${qs}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success || !json.data) return null;
  return json.data as UserReviewsPage;
}

export async function createUserReview(
  userId: string,
  input: CreateReviewInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await authFetch(`${API_BASE}/api/users/${userId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (res.ok) return { ok: true };
    return { ok: false, message: await readError(res) };
  } catch {
    return { ok: false, message: 'تعذّر الاتصال بالخادم' };
  }
}
