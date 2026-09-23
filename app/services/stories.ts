import { API_BASE } from './api';
import { authFetch } from './authFetch';
import { parseApiError } from './apiError';
import { fetchPublicFeed } from './fetchPublicFeed';

export type StoryReactionType = 'like' | 'love' | 'fire' | 'wow' | 'sad';

export type StoryUser = {
  id: string;
  username: string;
  displayName: string;
  arabicName: string;
  avatar?: string | null;
  verified?: boolean;
  country?: string;
};

export type StoryListing = {
  id: string;
  title: string;
  arabicTitle: string;
  images: string[];
  price: number;
  currency: string;
};

export type StoryItem = {
  id: string;
  thumbnail: string;
  mediaUrl?: string | null;
  caption?: string | null;
  captionAr?: string | null;
  location?: string | null;
  duration: number;
  isLive?: boolean;
  liveStreamId?: string | null;
  listingId?: string | null;
  listing?: StoryListing | null;
  viewsCount: number;
  reactionsCount: number;
  myReaction?: string | null;
  seen: boolean;
  createdAt: string;
  expiresAt: string;
  user?: StoryUser;
};

export type StoryGroup = {
  user: StoryUser;
  hasUnseen: boolean;
  latestThumbnail: string;
  storiesCount: number;
  stories: StoryItem[];
};

export type StoriesFeed = {
  items: StoryGroup[];
  myStories: StoryGroup | null;
};

const STORIES_FEED_TTL_MS = 60_000;
let storiesFeedCache: { key: string; data: StoriesFeed; fetchedAt: number } | null = null;

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

export async function fetchStoriesFeed(
  accessToken?: string | null,
  options?: { force?: boolean },
): Promise<StoriesFeed> {
  const cacheKey = accessToken ?? 'guest';
  const now = Date.now();
  if (
    !options?.force &&
    storiesFeedCache &&
    storiesFeedCache.key === cacheKey &&
    now - storiesFeedCache.fetchedAt < STORIES_FEED_TTL_MS
  ) {
    return storiesFeedCache.data;
  }

  const res = await fetchPublicFeed(`${API_BASE}/api/stories/feed`, accessToken);
  const json = await parseJson(res);
  if (!res.ok || !json.success) {
    throw new Error(json.messageAr || 'فشل تحميل القصص');
  }
  const data = json.data as StoriesFeed;
  storiesFeedCache = { key: cacheKey, data, fetchedAt: now };
  return data;
}

export async function createStory(
  accessToken: string,
  body: {
    thumbnail: string;
    mediaUrl?: string;
    caption?: string;
    captionAr?: string;
    location?: string;
    listingId?: string;
    duration?: number;
  },
): Promise<StoryItem> {
  const res = await fetch(`${API_BASE}/api/stories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const json = await parseJson(res);
  if (!res.ok || !json.success) {
    throw new Error(json.messageAr || 'فشل نشر القصة');
  }
  return json.data as StoryItem;
}

export async function deleteStory(
  accessToken: string,
  storyId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await authFetch(`${API_BASE}/api/stories/${storyId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: await parseApiError(res) };
}

export async function recordStoryView(
  accessToken: string,
  storyId: string,
): Promise<void> {
  await fetch(`${API_BASE}/api/stories/${storyId}/view`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function setStoryReaction(
  accessToken: string,
  storyId: string,
  type: StoryReactionType,
): Promise<{ type: string; reactionsCount: number }> {
  const res = await fetch(`${API_BASE}/api/stories/${storyId}/reactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ type }),
  });
  const json = await parseJson(res);
  if (!res.ok || !json.success) {
    throw new Error(json.messageAr || 'فشل التفاعل');
  }
  return json.data;
}

export async function removeStoryReaction(
  accessToken: string,
  storyId: string,
): Promise<{ reactionsCount: number }> {
  const res = await fetch(`${API_BASE}/api/stories/${storyId}/reactions`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await parseJson(res);
  if (!res.ok || !json.success) {
    throw new Error(json.messageAr || 'فشل إزالة التفاعل');
  }
  return json.data;
}

export async function replyToStory(
  accessToken: string,
  storyId: string,
  text: string,
): Promise<{ threadId: string; messageId: string; receiverId: string }> {
  const res = await fetch(`${API_BASE}/api/stories/${storyId}/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ text }),
  });
  const json = await parseJson(res);
  if (!res.ok || !json.success) {
    throw new Error(json.messageAr || 'فشل إرسال الرد');
  }
  return json.data;
}

export async function fetchStoryViewers(
  accessToken: string,
  storyId: string,
): Promise<{
  viewsCount: number;
  viewers: Array<{
    id: string;
    username: string;
    displayName: string;
    arabicName: string;
    avatar?: string | null;
    verified?: boolean;
    viewedAt: string;
  }>;
}> {
  const res = await fetch(`${API_BASE}/api/stories/${storyId}/viewers`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await parseJson(res);
  if (!res.ok || !json.success) {
    throw new Error(json.messageAr || 'فشل تحميل المشاهدات');
  }
  return json.data;
}

export const REACTION_META: {
  type: StoryReactionType;
  emoji: string;
  label: string;
}[] = [
  { type: 'like', emoji: '👍', label: 'إعجاب' },
  { type: 'love', emoji: '❤️', label: 'حب' },
  { type: 'fire', emoji: '🔥', label: 'نار' },
  { type: 'wow', emoji: '😮', label: 'واو' },
  { type: 'sad', emoji: '😢', label: 'حزن' },
];
