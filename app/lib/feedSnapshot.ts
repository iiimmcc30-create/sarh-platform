import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Listing, Post } from '@/services/types';
import { shouldReuseFreshResult } from '@/services/requestCoordination';

/** v2: invalidate v1 snapshots that may hold Mojibake from ArrayBuffer feed clones. */
export const FEED_SNAPSHOT_KEY = 'sarouh:feed_snapshot_v2';
export const FEED_SNAPSHOT_V1_KEY = 'sarouh:feed_snapshot_v1';
/** How long a disk snapshot may still be shown. Not the same as network freshness. */
export const FEED_SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** Same window as AppContext REFETCH_TTL_MS — skip GET only while this young. */
export const FEED_NETWORK_FRESH_MS = 60_000;
export const FEED_SNAPSHOT_GUEST_OWNER = 'guest';

export type FeedSnapshot = {
  posts: Post[];
  listings: Listing[];
  savedAt: number;
  ownerId: string;
};

export function feedSnapshotOwnerId(
  userId?: string | null,
  isAuthenticated?: boolean,
): string {
  if (isAuthenticated && userId) return String(userId);
  return FEED_SNAPSHOT_GUEST_OWNER;
}

export function isFeedSnapshotNetworkFresh(
  savedAt: number | undefined,
  options?: { force?: boolean; now?: number },
): boolean {
  return shouldReuseFreshResult(
    savedAt,
    FEED_NETWORK_FRESH_MS,
    options?.force === true,
    options?.now ?? Date.now(),
  );
}

export function planFeedSnapshotHydration(
  snapshot: FeedSnapshot | null,
  options?: { force?: boolean; now?: number },
): {
  posts: Post[] | null;
  listings: Listing[] | null;
  skipPostsNetwork: boolean;
  skipListingsNetwork: boolean;
} {
  if (!snapshot) {
    return {
      posts: null,
      listings: null,
      skipPostsNetwork: false,
      skipListingsNetwork: false,
    };
  }
  const posts = snapshot.posts.length > 0 ? snapshot.posts : null;
  const listings = snapshot.listings.length > 0 ? snapshot.listings : null;
  const fresh = isFeedSnapshotNetworkFresh(snapshot.savedAt, options);
  return {
    posts,
    listings,
    skipPostsNetwork: Boolean(posts) && fresh,
    skipListingsNetwork: Boolean(listings) && fresh,
  };
}

function isSnapshotShape(value: unknown): value is FeedSnapshot {
  if (!value || typeof value !== 'object') return false;
  const parsed = value as FeedSnapshot;
  return Array.isArray(parsed.posts) && Array.isArray(parsed.listings) && typeof parsed.savedAt === 'number';
}

export async function readFeedSnapshot(
  ownerId: string,
  now = Date.now(),
): Promise<FeedSnapshot | null> {
  try {
    void AsyncStorage.removeItem(FEED_SNAPSHOT_V1_KEY);
    const raw = await AsyncStorage.getItem(FEED_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isSnapshotShape(parsed)) return null;
    if (typeof parsed.ownerId !== 'string' || parsed.ownerId !== ownerId) return null;
    if (now - parsed.savedAt > FEED_SNAPSHOT_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function patchFeedSnapshot(
  partial: { posts?: Post[]; listings?: Listing[] },
  ownerId: string,
): Promise<void> {
  try {
    const prev = (await readFeedSnapshot(ownerId)) ?? {
      posts: [],
      listings: [],
      savedAt: 0,
      ownerId,
    };
    const next: FeedSnapshot = {
      posts: partial.posts ?? prev.posts,
      listings: partial.listings ?? prev.listings,
      savedAt: Date.now(),
      ownerId,
    };
    await AsyncStorage.setItem(FEED_SNAPSHOT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

export async function clearFeedSnapshot(): Promise<void> {
  try {
    await AsyncStorage.removeItem(FEED_SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}
