import { formatRelativeTimeAr } from '@/lib/formatRelativeTime';
import type { PostComment } from '@/services/types';

export type ListingCommentsFetchResult = {
  comments: PostComment[];
  error: string | null;
  rateLimited?: boolean;
  retryAfterSec?: number;
};

const CACHE_TTL_MS = 30_000;

const cache = new Map<string, { result: ListingCommentsFetchResult; fetchedAt: number }>();
const inflight = new Map<string, Promise<ListingCommentsFetchResult>>();
const rateLimitUntil = new Map<string, number>();

/** Test-only reset for in-memory fetch coordination state. */
export function resetListingCommentsFetchState() {
  cache.clear();
  inflight.clear();
  rateLimitUntil.clear();
}

function parseRetryAfterSec(header: string | null, bodyRetry?: unknown): number {
  if (header) {
    const parsed = parseInt(header, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  if (typeof bodyRetry === 'number' && bodyRetry > 0) return bodyRetry;
  return 60;
}

export function mapListingComment(c: {
  id: string;
  content: string;
  createdAt: string;
  parentId?: string | null;
  author: {
    id: string;
    username: string;
    displayName: string;
    arabicName: string;
    avatar?: string | null;
    verified?: boolean;
    verifiedTier?: string | null;
  };
}): PostComment {
  return {
    id: c.id,
    content: c.content,
    parentId: c.parentId ?? null,
    createdAt:
      formatRelativeTimeAr(c.createdAt) || new Date(c.createdAt).toLocaleString('ar-SA'),
    author: {
      id: c.author.id,
      username: c.author.username,
      displayName: c.author.displayName || '',
      arabicName: c.author.arabicName || '',
      avatar: c.author.avatar ?? undefined,
      verified: c.author.verified ?? false,
      verifiedTier: c.author.verifiedTier ?? null,
      followers: 0,
      following: 0,
      rating: null,
      country: 'SA',
      bio: '',
    },
  };
}

export type ListingCommentThreadData = {
  comment: PostComment;
  /** Oldest first, like the top-level list. */
  replies: PostComment[];
};

/**
 * Flat API list (oldest first) → top-level threads with their replies.
 * A reply whose parent is missing (e.g. outside the page) shows as top-level.
 */
export function groupListingComments(comments: PostComment[]): ListingCommentThreadData[] {
  const ids = new Set(comments.map((c) => c.id));
  const threads: ListingCommentThreadData[] = [];
  const byId = new Map<string, ListingCommentThreadData>();
  for (const c of comments) {
    if (c.parentId && ids.has(c.parentId)) continue;
    const t = { comment: c, replies: [] as PostComment[] };
    threads.push(t);
    byId.set(c.id, t);
  }
  for (const c of comments) {
    if (!c.parentId || !ids.has(c.parentId)) continue;
    const parent = byId.get(c.parentId);
    if (parent) parent.replies.push(c);
    else {
      // Reply to a reply (older data): attach to that reply's thread.
      const owner = threads.find((t) => t.replies.some((r) => r.id === c.parentId));
      if (owner) owner.replies.push(c);
      else threads.push({ comment: c, replies: [] });
    }
  }
  return threads;
}

export async function fetchListingComments(
  listingId: string,
  options?: { force?: boolean },
): Promise<ListingCommentsFetchResult> {
  const id = listingId?.trim();
  if (!id) return { comments: [], error: null };

  const force = options?.force === true;
  const now = Date.now();

  const limitedUntil = rateLimitUntil.get(id) ?? 0;
  if (now < limitedUntil) {
    const cached = cache.get(id);
    const retryAfterSec = Math.max(1, Math.ceil((limitedUntil - now) / 1000));
    return {
      comments: cached?.result.comments ?? [],
      error: 'طلبات كثيرة جداً، حاول لاحقاً',
      rateLimited: true,
      retryAfterSec,
    };
  }

  if (!force) {
    const cached = cache.get(id);
    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.result;
    }
  }

  const existing = inflight.get(id);
  if (existing) return existing;

  const promise = (async (): Promise<ListingCommentsFetchResult> => {
    try {
      const { API_BASE } = await import('@/services/api');
      const res = await fetch(`${API_BASE}/api/listings/${encodeURIComponent(id)}/comments`);
      const json = await res.json().catch(() => ({}));

      if (res.ok && json.success) {
        const rows = Array.isArray(json.data?.comments) ? json.data.comments : [];
        const result: ListingCommentsFetchResult = {
          comments: rows.map(mapListingComment),
          error: null,
        };
        cache.set(id, { result, fetchedAt: Date.now() });
        rateLimitUntil.delete(id);
        return result;
      }

      if (res.status === 429) {
        const retryAfterSec = parseRetryAfterSec(
          res.headers.get('Retry-After'),
          json.retryAfter,
        );
        rateLimitUntil.set(id, Date.now() + retryAfterSec * 1000);
        const result: ListingCommentsFetchResult = {
          comments: cache.get(id)?.result.comments ?? [],
          error: json.messageAr ?? json.message ?? 'طلبات كثيرة جداً، حاول لاحقاً',
          rateLimited: true,
          retryAfterSec,
        };
        cache.set(id, { result, fetchedAt: Date.now() });
        return result;
      }

      return {
        comments: [],
        error: json.messageAr ?? json.message ?? 'تعذّر تحميل التعليقات',
      };
    } catch {
      return { comments: [], error: 'تعذّر تحميل التعليقات — تحقق من الاتصال' };
    } finally {
      inflight.delete(id);
    }
  })();

  inflight.set(id, promise);
  return promise;
}
