import type { Post } from '@/services/types';

export const HOME_COMMUNITY_POSTS_LIMIT = 5;

function postTime(post: Pick<Post, 'createdAt'>): number {
  const raw = post.createdAt;
  if (!raw) return 0;
  const value = Date.parse(raw);
  return Number.isFinite(value) ? value : 0;
}

/** Highest likes first, then newest — the 5 posts shown on Home. */
export function pickHomeCommunityPosts<T extends Pick<Post, 'likes' | 'createdAt'>>(
  posts: T[],
  limit = HOME_COMMUNITY_POSTS_LIMIT,
): T[] {
  return [...posts]
    .sort((a, b) => {
      const likeDiff = (b.likes ?? 0) - (a.likes ?? 0);
      if (likeDiff !== 0) return likeDiff;
      return postTime(b) - postTime(a);
    })
    .slice(0, limit);
}
