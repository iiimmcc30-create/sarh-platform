import { hasInflight, runExclusive } from '@/lib/postEngagement';

/** What the user currently sees for a post's like button. */
export type LikeSnapshot = { liked: boolean; likes: number };

export type LikeToggleResult = LikeSnapshot & { ok: boolean; error?: string };

export const LIKE_ERROR_FALLBACK_AR = 'تعذّر تحديث الإعجاب، حاول مجدداً';

export function likeInflightKey(postId: string): string {
  return `like:${postId}`;
}

/** True while a like/unlike request for this post is in flight. */
export function isLikePending(postId: string): boolean {
  return hasInflight(likeInflightKey(postId));
}

export function nextLikeState(current: LikeSnapshot): LikeSnapshot {
  const liked = !current.liked;
  const base = Math.max(0, current.likes);
  return { liked, likes: liked ? base + 1 : Math.max(0, base - 1) };
}

type ToggleLikeOptions = {
  postId: string;
  /** State computed synchronously before any setState (never inside an updater). */
  current: LikeSnapshot;
  /** Sends the toggle; resolves with the server payload or throws with a user-facing message. */
  request: () => Promise<{ liked?: unknown; likesCount?: unknown } | null | undefined>;
  /** Applies a like state to every place that renders it (optimistic, settled, or rollback). */
  apply: (state: LikeSnapshot) => void;
  onPendingChange?: (pending: boolean) => void;
  onError?: (message: string) => void;
};

/**
 * Optimistic like/unlike with a per-post in-flight guard.
 * - A second tap while the first request is pending is ignored (returns null) — no duplicate request.
 * - The server answer (liked + likesCount) is authoritative once it arrives.
 * - Any failure restores the exact pre-tap state and reports the error.
 */
export function toggleLikeOptimistic(
  options: ToggleLikeOptions,
): Promise<LikeToggleResult | null> {
  const key = likeInflightKey(options.postId);
  if (hasInflight(key)) return Promise.resolve(null);

  return runExclusive(key, async (): Promise<LikeToggleResult> => {
    const previous: LikeSnapshot = {
      liked: Boolean(options.current.liked),
      likes: Math.max(0, options.current.likes || 0),
    };
    const optimistic = nextLikeState(previous);
    options.apply(optimistic);
    options.onPendingChange?.(true);
    try {
      const data = await options.request();
      const liked = typeof data?.liked === 'boolean' ? data.liked : optimistic.liked;
      const likes =
        typeof data?.likesCount === 'number' && Number.isFinite(data.likesCount)
          ? Math.max(0, data.likesCount)
          : liked === optimistic.liked
            ? optimistic.likes
            : previous.likes;
      const settled = { liked, likes };
      options.apply(settled);
      return { ok: true, ...settled };
    } catch (err) {
      options.apply(previous);
      const message =
        err instanceof Error && err.message.trim() && err.message !== 'like_failed'
          ? err.message.trim()
          : LIKE_ERROR_FALLBACK_AR;
      options.onError?.(message);
      return { ok: false, ...previous, error: message };
    } finally {
      options.onPendingChange?.(false);
    }
  });
}
