import { API_BASE } from './api';
import { authFetch } from './authFetch';
import type { Post } from './types';

export function mapPostFromApi(p: Record<string, unknown> | null | undefined): Post | null {
  if (!p?.id || !p.author) return null;
  const author = p.author as Record<string, unknown>;
  return {
    id: String(p.id),
    author: {
      id: String(author.id),
      username: String(author.username ?? ''),
      displayName: String(author.displayName ?? ''),
      arabicName: String(author.arabicName ?? ''),
      avatar: author.avatar ? String(author.avatar) : undefined,
      verified: Boolean(author.verified),
      isAI: Boolean(author.isAI),
      followers: Number(author.followersCount ?? 0),
      following: Number(author.followingCount ?? 0),
      rating: typeof author.rating === 'number' ? author.rating : null,
      country: (author.country as Post['author']['country']) || 'SA',
      bio: String(author.bio ?? ''),
    },
    content: String(p.content ?? ''),
    arabicContent: String(p.arabicContent ?? ''),
    image: p.image ? String(p.image) : undefined,
    images:
      Array.isArray(p.images) && p.images.length > 0
        ? (p.images as string[])
        : p.image
          ? [String(p.image)]
          : undefined,
    video: p.video ? String(p.video) : undefined,
    likes: Number(p.likesCount ?? 0),
    reposts: Number(p.repostsCount ?? 0),
    comments: Number(p.commentsCount ?? 0),
    views: typeof p.viewsCount === 'number' ? p.viewsCount : undefined,
    postedAt: new Date(String(p.createdAt)).toLocaleDateString('ar-SA'),
    createdAt: String(p.createdAt),
    liked: Boolean(p.liked),
    reposted: Boolean(p.reposted),
    bookmarked: Boolean(p.bookmarked),
  };
}

export async function fetchUserPosts(userId: string): Promise<Post[]> {
  const res = await authFetch(
    `${API_BASE}/api/posts?userId=${encodeURIComponent(userId)}`,
    {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    },
  );
  if (!res.ok) throw new Error('user_posts_fetch_failed');
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data?.posts)) {
    throw new Error('user_posts_fetch_failed');
  }
  return json.data.posts
    .map((p: Record<string, unknown>) => mapPostFromApi(p))
    .filter((p: Post | null): p is Post => Boolean(p));
}
