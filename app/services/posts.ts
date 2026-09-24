import { API_BASE } from './api';
import { authFetch } from './authFetch';
import type { Post, User } from './types';

export type ProfileActivityKind = 'replies' | 'reposts' | 'likes';

export type ProfileReply = {
  id: string;
  content: string;
  createdAt: string;
  author: User;
  postId: string;
  originalAuthor: Pick<User, 'id' | 'username' | 'displayName' | 'arabicName'>;
};

function mapAuthor(author: Record<string, unknown> | null | undefined): User {
  return {
    id: String(author?.id ?? ''),
    username: String(author?.username ?? ''),
    displayName: String(author?.displayName ?? ''),
    arabicName: String(author?.arabicName ?? ''),
    avatar: author?.avatar ? String(author.avatar) : undefined,
    verified: Boolean(author?.verified),
    isAI: Boolean(author?.isAI),
    followers: Number(author?.followersCount ?? 0),
    following: Number(author?.followingCount ?? 0),
    rating: typeof author?.rating === 'number' ? author.rating : null,
    country: (author?.country as User['country']) || 'SA',
    bio: String(author?.bio ?? ''),
  };
}

export function mapPostFromApi(p: Record<string, unknown> | null | undefined): Post | null {
  if (!p?.id || !p.author) return null;
  return {
    id: String(p.id),
    author: mapAuthor(p.author as Record<string, unknown>),
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
    media: Array.isArray(p.media)
      ? (p.media as Array<Record<string, unknown>>)
          .filter((row) => row && typeof row.url === 'string')
          .map((row, index) => ({
            id: row.id ? String(row.id) : undefined,
            url: String(row.url),
            type: String(row.type).toUpperCase() === 'VIDEO' ? 'VIDEO' : 'IMAGE',
            sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : index,
            posterUrl: row.posterUrl ? String(row.posterUrl) : undefined,
          }))
      : undefined,
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

function mapReplyFromApi(row: Record<string, unknown> | null | undefined): ProfileReply | null {
  if (!row?.id || !row.author || !row.postId) return null;
  const original = (row.originalAuthor as Record<string, unknown> | undefined) ?? {};
  return {
    id: String(row.id),
    content: String(row.content ?? ''),
    createdAt: String(row.createdAt ?? ''),
    author: mapAuthor(row.author as Record<string, unknown>),
    postId: String(row.postId),
    originalAuthor: {
      id: String(original.id ?? ''),
      username: String(original.username ?? ''),
      displayName: String(original.displayName ?? ''),
      arabicName: String(original.arabicName ?? ''),
    },
  };
}

export async function fetchUserPostActivity(
  userId: string,
  activity: ProfileActivityKind,
): Promise<{ posts: Post[]; replies: ProfileReply[] }> {
  const res = await authFetch(
    `${API_BASE}/api/posts?userId=${encodeURIComponent(userId)}&activity=${encodeURIComponent(activity)}`,
    {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    },
  );
  if (!res.ok) throw new Error('user_activity_fetch_failed');
  const json = await res.json();
  if (!json.success || !json.data) throw new Error('user_activity_fetch_failed');

  const posts = Array.isArray(json.data.posts)
    ? json.data.posts
        .map((p: Record<string, unknown>) => mapPostFromApi(p))
        .filter((p: Post | null): p is Post => Boolean(p))
    : [];
  const replies = Array.isArray(json.data.replies)
    ? json.data.replies
        .map((row: Record<string, unknown>) => mapReplyFromApi(row))
        .filter((row: ProfileReply | null): row is ProfileReply => Boolean(row))
    : [];
  return { posts, replies };
}
