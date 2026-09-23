import { readFileSync } from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearFeedSnapshot,
  FEED_NETWORK_FRESH_MS,
  FEED_SNAPSHOT_GUEST_OWNER,
  FEED_SNAPSHOT_KEY,
  FEED_SNAPSHOT_MAX_AGE_MS,
  feedSnapshotOwnerId,
  isFeedSnapshotNetworkFresh,
  patchFeedSnapshot,
  planFeedSnapshotHydration,
  readFeedSnapshot,
  type FeedSnapshot,
} from '@/lib/feedSnapshot';
import { shouldReuseFreshResult } from '@/services/requestCoordination';
import {
  getBootstrappedListingsPage,
  rememberListingsBootstrapPage,
  resetListingsBootstrapCache,
  searchListingsPage,
} from '@/services/listings';
import { resetRequestCoordination } from '@/services/requestCoordination';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

const memory = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => memory.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    memory.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    memory.delete(key);
  }),
}));

jest.mock('@/services/api', () => ({
  ensureApiReachable: async () => 'https://api.test',
  API_BASE: 'https://api.test',
}));

function jsonResponse(body: unknown, status = 200): Response {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { get: () => null },
    json: async () => JSON.parse(text),
    text: async () => text,
  } as unknown as Response;
}

function samplePost(id: string): FeedSnapshot['posts'][number] {
  return {
    id,
    author: {
      id: 'a1',
      username: 'u',
      displayName: 'U',
      arabicName: 'م',
      verified: false,
      followers: 0,
      following: 0,
      rating: null,
      country: 'SA',
      bio: '',
    },
    content: 'c',
    arabicContent: 'محتوى',
    likes: 1,
    reposts: 0,
    comments: 0,
    postedAt: '١',
    createdAt: '2026-01-01T00:00:00.000Z',
    liked: true,
    reposted: false,
  };
}

function sampleListing(id: string): FeedSnapshot['listings'][number] {
  return {
    id,
    title: id,
    arabicTitle: id,
    price: 10,
    currency: 'SAR',
    category: 'sheep',
    breed: '',
    age: '',
    location: 'Riyadh',
    arabicLocation: 'الرياض',
    country: 'SA',
    images: [],
    description: '',
    arabicDescription: '',
    seller: {
      id: 's1',
      username: 's',
      displayName: '',
      arabicName: '',
      verified: false,
      followers: 0,
      following: 0,
      rating: null,
      country: 'SA',
      bio: '',
    },
    featured: false,
    pinned: false,
    postedAt: '',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function snapshot(overrides: Partial<FeedSnapshot> = {}): FeedSnapshot {
  return {
    posts: [samplePost('p1')],
    listings: [sampleListing('l1')],
    savedAt: 1_000_000,
    ownerId: FEED_SNAPSHOT_GUEST_OWNER,
    ...overrides,
  };
}

describe('P1-03 feed snapshot freshness', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    memory.clear();
    resetListingsBootstrapCache();
    resetRequestCoordination();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('keeps storage TTL at 6h and network freshness at 60s', () => {
    expect(FEED_SNAPSHOT_MAX_AGE_MS).toBe(6 * 60 * 60 * 1000);
    expect(FEED_NETWORK_FRESH_MS).toBe(60_000);
    expect(src('contexts/AppContext.tsx')).toContain('const REFETCH_TTL_MS = 60_000');
    expect(src('contexts/AppContext.tsx')).toContain("postsLastSuccessAt.set('for_you', snapshot.savedAt)");
    expect(src('contexts/AppContext.tsx')).toContain('listingsLastSuccessAt = snapshot.savedAt');
    expect(src('contexts/AppContext.tsx')).toContain('waitForFeedSnapshotBoot');
  });

  it('skips posts and listings GETs when the snapshot is network-fresh', () => {
    const plan = planFeedSnapshotHydration(snapshot(), { now: 1_000_000 + 5_000 });
    expect(plan.posts?.[0].id).toBe('p1');
    expect(plan.listings?.[0].id).toBe('l1');
    expect(plan.skipPostsNetwork).toBe(true);
    expect(plan.skipListingsNetwork).toBe(true);
    expect(isFeedSnapshotNetworkFresh(1_000_000, { now: 1_000_000 + 5_000 })).toBe(true);
    expect(shouldReuseFreshResult(1_000_000, FEED_NETWORK_FRESH_MS, false, 1_000_000 + 5_000)).toBe(
      true,
    );
  });

  it('shows stale snapshot data and does not skip revalidation after TTL', () => {
    const plan = planFeedSnapshotHydration(snapshot(), {
      now: 1_000_000 + FEED_NETWORK_FRESH_MS + 1,
    });
    expect(plan.posts?.[0].id).toBe('p1');
    expect(plan.listings?.[0].id).toBe('l1');
    expect(plan.skipPostsNetwork).toBe(false);
    expect(plan.skipListingsNetwork).toBe(false);
  });

  it('still shows a disk snapshot older than 60s as long as it is under 6 hours', async () => {
    const savedAt = Date.now() - 2 * 60 * 60 * 1000;
    await AsyncStorage.setItem(
      FEED_SNAPSHOT_KEY,
      JSON.stringify(snapshot({ savedAt, ownerId: 'user-a' })),
    );
    const loaded = await readFeedSnapshot('user-a');
    expect(loaded?.posts[0].id).toBe('p1');
    expect(isFeedSnapshotNetworkFresh(savedAt)).toBe(false);
  });

  it('pull-to-refresh / force bypasses snapshot freshness', () => {
    const plan = planFeedSnapshotHydration(snapshot(), {
      now: 1_000_000 + 1_000,
      force: true,
    });
    expect(plan.skipPostsNetwork).toBe(false);
    expect(plan.skipListingsNetwork).toBe(false);
    expect(src('app/(tabs)/posts.tsx')).toContain('force: Boolean(opts?.refresh || opts?.force)');
    expect(src('contexts/AppContext.tsx')).toContain("fetchPosts('for_you', { force: true })");
    expect(src('contexts/AppContext.tsx')).toContain('fetchListings({ force })');
  });

  it('rejects another user\'s snapshot and snapshots without ownerId', async () => {
    await AsyncStorage.setItem(
      FEED_SNAPSHOT_KEY,
      JSON.stringify(snapshot({ ownerId: 'user-a' })),
    );
    expect(await readFeedSnapshot('user-b')).toBeNull();
    expect(await readFeedSnapshot(FEED_SNAPSHOT_GUEST_OWNER)).toBeNull();

    await AsyncStorage.setItem(
      FEED_SNAPSHOT_KEY,
      JSON.stringify({
        posts: [samplePost('p1')],
        listings: [sampleListing('l1')],
        savedAt: Date.now(),
      }),
    );
    expect(await readFeedSnapshot(FEED_SNAPSHOT_GUEST_OWNER)).toBeNull();
    expect(feedSnapshotOwnerId('user-a', true)).toBe('user-a');
    expect(feedSnapshotOwnerId('user-a', false)).toBe(FEED_SNAPSHOT_GUEST_OWNER);
  });

  it('clears the disk snapshot on logout so the next session cannot reuse it', () => {
    const ctx = src('contexts/AppContext.tsx');
    expect(ctx).toContain('if (wasUser) void clearFeedSnapshot()');
    expect(ctx).toContain('FEED_SNAPSHOT_GUEST_OWNER');
    expect(ctx).toContain('switchedUser');
  });

  it('keeps existing rows when a later fetch fails and replaces them on success', () => {
    const ctx = src('contexts/AppContext.tsx');
    expect(ctx).not.toContain('setPosts([])');
    expect(ctx).not.toContain('setListingsState([])');
    expect(ctx).toContain('const applied = applyPostsFeed(inflightKey, fetchedPosts, applyGen)');
    expect(ctx).toContain('succeeded = applied');
    expect(ctx).toContain('if (!gen.isCurrent(token)) return false');
    expect(ctx).toContain('Keep existing listings — never clear on 429');
    expect(ctx).toContain('Keep existing posts — never clear on 429');
  });

  it('does not start feed GETs until snapshot hydrate has stamped freshness', () => {
    const ctx = src('contexts/AppContext.tsx');
    const waitAt = ctx.indexOf('async function waitForFeedSnapshotBoot');
    const fetchPostsAt = ctx.indexOf('const fetchPosts = useCallback');
    const fetchListingsAt = ctx.indexOf('const fetchListings = useCallback');
    expect(waitAt).toBeGreaterThan(-1);
    expect(ctx).toContain('await waitForFeedSnapshotBoot()');
    expect(fetchPostsAt).toBeGreaterThan(waitAt);
    expect(fetchListingsAt).toBeGreaterThan(waitAt);
    expect((ctx.match(/await waitForFeedSnapshotBoot\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('writes ownerId when patching so later reads stay session-safe', async () => {
    await patchFeedSnapshot(
      { posts: [samplePost('p2')], listings: [sampleListing('l2')] },
      'user-a',
    );
    expect(await readFeedSnapshot('user-b')).toBeNull();
    const mine = await readFeedSnapshot('user-a');
    expect(mine?.ownerId).toBe('user-a');
    expect(mine?.posts[0].id).toBe('p2');
    await clearFeedSnapshot();
    expect(await readFeedSnapshot('user-a')).toBeNull();
  });
});

describe('P0-3 listings bootstrap still dedupes after snapshot work', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    resetListingsBootstrapCache();
    resetRequestCoordination();
    jest.restoreAllMocks();
  });

  it('reuses a remembered default first page instead of fetching listings again', async () => {
    rememberListingsBootstrapPage(
      {
        listings: [sampleListing('boot-1')],
        nextCursor: 'c1',
        hasMore: true,
      },
      null,
    );
    global.fetch = jest.fn(async () =>
      jsonResponse({ success: true, data: { listings: [], nextCursor: null, hasMore: false } }),
    ) as unknown as typeof fetch;

    const page = await searchListingsPage({});
    expect(page.listings.map((row) => row.id)).toEqual(['boot-1']);
    expect(page.nextCursor).toBe('c1');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(getBootstrappedListingsPage(null)?.listings[0].id).toBe('boot-1');
  });
});
