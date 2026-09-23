import { API_BASE } from '@/services/api';
import { fetchWithTimeout } from '@/services/fetchWithTimeout';
import { FEED_TIMEOUT_MS } from '@/services/fetchPublicFeed';
import { dedupeInflight } from '@/services/requestCoordination';

export type EditorialStory = {
  id: string;
  titleAr: string;
  bodyAr: string;
  imageUrl: string;
  duration: number;
  sortOrder: number;
  isActive: boolean;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

const STORIES_TTL_MS = 60_000;
let storiesCache: { at: number; data: EditorialStory[] } | null = null;

/** Test-only reset. */
export function resetEditorialStoriesCache() {
  storiesCache = null;
}

export async function fetchEditorialStories(
  options?: { force?: boolean },
): Promise<EditorialStory[]> {
  const force = options?.force === true;
  const now = Date.now();
  if (!force && storiesCache && now - storiesCache.at < STORIES_TTL_MS) {
    return storiesCache.data;
  }

  return dedupeInflight('GET:/api/editorial-stories', async () => {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/editorial-stories`, {}, FEED_TIMEOUT_MS);
      if (!res.ok) return storiesCache?.data ?? [];
      const json = (await res.json()) as { data?: { stories?: EditorialStory[] } };
      const stories = json?.data?.stories;
      if (!Array.isArray(stories)) return storiesCache?.data ?? [];
      storiesCache = { at: Date.now(), data: stories };
      return stories;
    } catch {
      return storiesCache?.data ?? [];
    }
  });
}
