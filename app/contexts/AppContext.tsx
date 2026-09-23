// Powered by OnSpace.AI
// SAFAT — App Context (current user + global state)

import { createContext, ReactNode, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Post, Listing } from '@/services/types';
import { useAuth } from './AuthContext';
import { API_BASE } from '@/services/api';
import { parseApiError } from '@/services/apiError';
import { sanitizeListingLimitMessage } from '@/lib/listingLimits';
import { authFetch, getAccessToken } from '@/services/authFetch';
import { fetchWithTimeout } from '@/services/fetchWithTimeout';
import { fetchPublicFeed } from '@/services/fetchPublicFeed';
import {
  createRequestGeneration,
  feedRetryDelayMs,
  isRateLimited,
  noteRateLimitFromResponse,
  shouldReuseFreshResult,
} from '@/services/requestCoordination';
import { needsUpload } from '@/services/mediaUri';
import { uploadImageFromUri } from '@/services/upload';
import { resolveCurrentUserId } from '@/lib/currentUser';
import { listingThumbUri, listingVideoUrl } from '@/lib/listingMedia';
import { isManagedListing, managedSeller } from '@/lib/managedListing';
import { resolveMediaUrl } from '@/services/media';
import { prefetchRemoteImages } from '@/lib/prefetchRemoteImages';
import {
  buildListingsFeedUrl,
  getBootstrappedListingsPage,
  rememberListingsBootstrapPage,
} from '@/services/listings';
import {
  clearFeedSnapshot,
  feedSnapshotOwnerId,
  FEED_SNAPSHOT_GUEST_OWNER,
  patchFeedSnapshot,
  planFeedSnapshotHydration,
  readFeedSnapshot,
} from '@/lib/feedSnapshot';
import { runExclusive } from '@/lib/postEngagement';

const BOOKMARKS_STORAGE_KEY = 'sarouh:bookmarked_posts';
const REFETCH_TTL_MS = 60_000;
const FEED_RETRY_MAX = 4;

let feedSnapshotBootDone = false;
let resolveFeedSnapshotBoot: (() => void) | null = null;
let feedSnapshotBoot = new Promise<void>((resolve) => {
  resolveFeedSnapshotBoot = resolve;
});

function finishFeedSnapshotBoot() {
  if (feedSnapshotBootDone) return;
  feedSnapshotBootDone = true;
  resolveFeedSnapshotBoot?.();
  resolveFeedSnapshotBoot = null;
}

async function waitForFeedSnapshotBoot() {
  if (feedSnapshotBootDone) return;
  await feedSnapshotBoot;
}

let userFetchInflight: Promise<void> | null = null;
let listingsFetchInflight: Promise<void> | null = null;
let listingsLastFetchOk = false;
let listingsLastSuccessAt = 0;
const postsFetchInflight = new Map<string, Promise<void>>();
const postsLastFetchOk = new Map<string, boolean>();
const postsLastSuccessAt = new Map<string, number>();
const postsCacheByFeed = new Map<string, Post[]>();
const postsApplyGenerationByFeed = {
  for_you: createRequestGeneration(),
  following: createRequestGeneration(),
};
function postsGeneration(feed: string) {
  return feed === 'following'
    ? postsApplyGenerationByFeed.following
    : postsApplyGenerationByFeed.for_you;
}
let activePostsFeed: 'for_you' | 'following' | null = null;
let bootstrapInflight: Promise<void> | null = null;

export type FetchPostsOptions = { force?: boolean };

export type ActionResult = { ok: boolean; error?: string; listingId?: string };

const DEFAULT_USER: User = {
  id: '',
  username: '',
  displayName: '',
  arabicName: '',
  avatar: undefined,
  verified: false,
  followers: 0,
  following: 0,
  rating: null,
  reviewCount: 0,
  country: 'SA',
  bio: '',
};

interface AppContextValue {
  me: User;
  updateMe: (updates: Partial<User>) => Promise<ActionResult>;
  posts: Post[];
  fetchPosts: (feed?: 'for_you' | 'following', options?: FetchPostsOptions) => Promise<boolean>;
  fetchListings: (options?: { force?: boolean }) => Promise<boolean>;
  addPost: (post: Omit<Post, 'id' | 'author' | 'likes' | 'reposts' | 'comments' | 'postedAt' | 'liked' | 'reposted'>) => Promise<boolean>;
  updatePost: (postId: string, data: { content: string; arabicContent: string; image?: string | null; images?: string[] }) => Promise<boolean>;
  deletePost: (postId: string) => Promise<ActionResult>;
  listings: Listing[];
  addListing: (listingData: any) => Promise<ActionResult>;
  updateListing: (listingId: string, listingData: any) => Promise<ActionResult>;
  likedPosts: Set<string>;
  repostedPosts: Set<string>;
  bookmarkedPosts: Set<string>;
  toggleLike: (postId: string) => Promise<void>;
  toggleRepost: (postId: string) => Promise<void>;
  toggleBookmark: (postId: string) => Promise<void>;
  setPostViews: (postId: string, views: number) => void;
  addComment: (postId: string, content: string) => Promise<boolean>;
  removeListing: (
    listingId: string,
    options: { sold: boolean; reason: string },
  ) => Promise<ActionResult>;
  refetchData: (force?: boolean) => Promise<void>;
  /** Profile/header identity only — does not refetch posts or listings. */
  refetchUser: (force?: boolean) => Promise<void>;
}

export const AppContext = createContext<AppContextValue | null>(null);

export type AppUserContextValue = Pick<AppContextValue, 'me' | 'updateMe'>;

/** Narrow user slice — liking/feed updates must not rerender Home/sidebars. */
export const AppUserContext = createContext<AppUserContextValue | null>(null);

function collectPostImageUris(posts: Post[]): Array<string | undefined> {
  const uris: Array<string | undefined> = [];
  for (const post of posts) {
    if (post.images?.length) {
      for (const img of post.images) uris.push(img);
    } else {
      uris.push(post.image);
    }
    uris.push(post.author?.avatar);
  }
  return uris;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { user, accessToken, isAuthenticated, isLoading: authLoading } = useAuth();
  const [me, setMe] = useState<User>(DEFAULT_USER);
  const [posts, setPosts] = useState<Post[]>([]);
  const [listingsState, setListingsState] = useState<Listing[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [repostedPosts, setRepostedPosts] = useState<Set<string>>(new Set());
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Set<string>>(new Set());

  // Bookmarks are device-local (no backend model yet) — restore on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(BOOKMARKS_STORAGE_KEY);
        if (raw) setBookmarkedPosts(new Set(JSON.parse(raw)));
      } catch {
        /* ignore corrupt/missing storage */
      }
    })();
  }, []);

  const persistBookmarks = useCallback((ids: Set<string>) => {
    AsyncStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify([...ids])).catch(() => {});
  }, []);

  const patchPost = useCallback((postId: string, patch: Partial<Post>) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...patch } : p)));
    postsCacheByFeed.forEach((list, key) => {
      postsCacheByFeed.set(
        key,
        list.map((p) => (p.id === postId ? { ...p, ...patch } : p)),
      );
    });
  }, []);

  const setPostViews = useCallback((postId: string, views: number) => {
    patchPost(postId, { views });
  }, [patchPost]);

  // Helper mapping functions
  const mapBackendUser = useCallback((u: any): User => {
    if (!u || typeof u !== 'object') return { ...DEFAULT_USER };
    return {
      id: String(u.id ?? ''),
      username: u.username || '',
      displayName: u.displayName || '',
      arabicName: u.arabicName || '',
      avatar: u.avatar || undefined,
      coverImage: u.coverImage || undefined,
      verified: u.verified ?? false,
      isAI: u.isAI ?? false,
      followers: u.followersCount ?? u.followers ?? 0,
      following: u.followingCount ?? u.following ?? 0,
      postsCount: u.postsCount ?? 0,
      rating: typeof u.rating === 'number' ? u.rating : null,
      reviewCount: u.reviewCount ?? 0,
      country: u.country || 'SA',
      bio: u.bio || '',
      nameChangedAt: u.nameChangedAt ?? null,
      usernameChangedAt: u.usernameChangedAt ?? null,
      nameNextAllowedAt: u.nameNextAllowedAt ?? null,
      usernameNextAllowedAt: u.usernameNextAllowedAt ?? null,
    };
  }, []);

  const mapBackendPost = useCallback((p: any): Post | null => {
    if (!p?.id) return null;
    return {
      id: p.id,
      author: mapBackendUser(p.author),
      content: p.content,
      arabicContent: p.arabicContent,
      image: p.image,
      images: Array.isArray(p.images) && p.images.length > 0 ? p.images : p.image ? [p.image] : undefined,
      video: p.video ?? undefined,
      media: Array.isArray(p.media)
        ? p.media
            .filter((row: { url?: string }) => row?.url)
            .map((row: { id?: string; url: string; type?: string; sortOrder?: number; posterUrl?: string }, index: number) => ({
              id: row.id,
              url: row.url,
              type: String(row.type).toUpperCase() === 'VIDEO' ? 'VIDEO' : 'IMAGE',
              sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : index,
              posterUrl: row.posterUrl,
            }))
        : undefined,
      likes: p.likesCount ?? 0,
      reposts: p.repostsCount ?? 0,
      comments: p.commentsCount ?? 0,
      views: typeof p.viewsCount === 'number' ? p.viewsCount : undefined,
      postedAt: new Date(p.createdAt).toLocaleDateString('ar-SA'),
      createdAt: p.createdAt,
      liked: p.liked ?? false,
      reposted: p.reposted ?? false,
      bookmarked: typeof p.bookmarked === 'boolean' ? p.bookmarked : undefined,
    };
  }, [mapBackendUser]);

  const mapBackendListing = useCallback((l: any): Listing | null => {
    if (!l?.id) return null;
    return {
      id: l.id,
      title: l.title,
      arabicTitle: l.arabicTitle,
      price: l.price,
      currency: l.currency || 'SAR',
      category: l.category,
      categoryId: l.categoryId ?? l.marketCategory?.id,
      subcategoryId: l.subcategoryId ?? l.marketSubcategory?.id,
      categoryNameAr: l.marketCategory?.nameAr,
      subcategoryNameAr: l.marketSubcategory?.nameAr,
      breed: l.breed || '',
      age: l.age || '',
      location: l.location,
      arabicLocation: l.arabicLocation,
      country: l.country,
      contactPhone: l.contactPhone || undefined,
      weightKg: typeof l.weightKg === 'number' ? l.weightKg : undefined,
      requiresWeight:
        l.marketCategory?.requiresWeight === true ||
        l.marketSubcategory?.requiresWeight === true ||
        l.category === 'slaughter',
      images: (l.images ?? [])
        .map((uri: string) => {
          const raw = typeof uri === 'string' ? uri.trim() : '';
          return resolveMediaUrl(raw) ?? raw;
        })
        .filter((uri: string) => uri.length > 0),
      videoUrl: resolveMediaUrl(listingVideoUrl({ images: l.images, videoUrl: l.videoUrl })),
      thumbnailUrl: resolveMediaUrl(
        typeof l.thumbnailUrl === 'string' && l.thumbnailUrl.trim() ? l.thumbnailUrl : undefined,
      ),
      description: l.description,
      arabicDescription: l.arabicDescription,
      origin: l.origin === 'ADMIN_MANAGED' ? 'ADMIN_MANAGED' : 'USER',
      displayUsername: l.displayUsername || undefined,
      displaySellerName: l.displaySellerName || undefined,
      displayPhone: l.displayPhone || undefined,
      displayRegion: l.displayRegion || undefined,
      seller: isManagedListing(l)
        ? managedSeller(l)
        : mapBackendUser(l.seller),
      featured: l.featured ?? false,
      pinned: l.pinned ?? false,
      postedAt: new Date(l.createdAt).toLocaleDateString('ar-SA'),
      createdAt: l.createdAt,
      views: typeof l.views === 'number' ? l.views : undefined,
      editCount: typeof l.editCount === 'number' ? l.editCount : 0,
    };
  }, [mapBackendUser]);

  const fetchUserData = useCallback(async () => {
    const userId = resolveCurrentUserId(user);
    if (!isAuthenticated || !accessToken || !userId) return;
    if (userFetchInflight) {
      await userFetchInflight;
      return;
    }
    userFetchInflight = (async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/users/${userId}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            setMe(mapBackendUser(json.data));
          }
        }
      } catch (err) {
        console.warn('[AppContext] Failed to fetch user profile:', err);
      }
    })().finally(() => {
      userFetchInflight = null;
    });
    await userFetchInflight;
  }, [isAuthenticated, accessToken, user, mapBackendUser]);

  const fetchListings = useCallback(async (options?: { force?: boolean }): Promise<boolean> => {
    await waitForFeedSnapshotBoot();
    if (listingsFetchInflight) {
      await listingsFetchInflight;
      return listingsLastFetchOk;
    }
    if (isRateLimited()) {
      return listingsLastFetchOk;
    }
    if (!options?.force && shouldReuseFreshResult(listingsLastSuccessAt, REFETCH_TTL_MS)) {
      return listingsLastFetchOk;
    }
    if (!options?.force) {
      const boot = getBootstrappedListingsPage(accessToken);
      if (boot) {
        setListingsState(boot.listings);
        listingsLastSuccessAt = Date.now();
        listingsLastFetchOk = true;
        return true;
      }
    }
    let succeeded = false;
    listingsFetchInflight = (async () => {
      try {
        const res = await fetchPublicFeed(buildListingsFeedUrl(API_BASE), accessToken);
        const json = await res.json().catch(() => ({}));
        if (res.status === 429) {
          noteRateLimitFromResponse(res, json);
          // Keep existing listings — never clear on 429.
          return;
        }
        if (!res.ok) return;
        if (json.success && Array.isArray(json.data?.listings)) {
          const market = json.data.listings
            .map(mapBackendListing)
            .filter((listing: Listing | null): listing is Listing =>
              Boolean(listing && listing.country !== 'EG'),
            );
          setListingsState(market);
          prefetchRemoteImages(
            market.map((l: Listing) => listingThumbUri(l)),
            8,
          );
          succeeded = true;
          listingsLastSuccessAt = Date.now();
          rememberListingsBootstrapPage(
            {
              listings: market,
              nextCursor:
                typeof json.data.nextCursor === 'string' ? json.data.nextCursor : null,
              hasMore: json.data.hasMore === true,
            },
            accessToken,
          );
          void patchFeedSnapshot(
            { listings: market },
            feedSnapshotOwnerId(user?.id, isAuthenticated),
          );
        }
      } catch (err) {
        console.warn('[AppContext] Failed to fetch listings:', err);
      }
    })().finally(() => {
      listingsFetchInflight = null;
      listingsLastFetchOk = succeeded;
    });
    await listingsFetchInflight;
    return succeeded;
  }, [accessToken, isAuthenticated, mapBackendListing, user?.id]);

  // Keep ownership checks working even before profile fetch finishes
  useEffect(() => {
    if (!user) {
      setMe(DEFAULT_USER);
      return;
    }
    setMe((prev) => ({
      ...prev,
      id: resolveCurrentUserId(user, prev) || prev.id,
      username: user.username || prev.username,
      displayName: user.displayName || prev.displayName,
      arabicName: user.arabicName || user.displayName || prev.arabicName,
      avatar: user.avatar ?? prev.avatar,
      verified: user.verified ?? prev.verified,
      country: (user.country as User['country']) || prev.country || 'SA',
    }));
  }, [user]);

  const commitPostsFeed = useCallback((
    feed: 'for_you' | 'following',
    nextPosts: Post[],
  ) => {
    activePostsFeed = feed;
    setPosts(nextPosts);
    prefetchRemoteImages(collectPostImageUris(nextPosts), 8);

    const liked = new Set<string>();
    const reposted = new Set<string>();
    nextPosts.forEach((p: Post) => {
      if (p.liked) liked.add(p.id);
      if (p.reposted) reposted.add(p.id);
    });
    setLikedPosts(liked);
    setRepostedPosts(reposted);
    setBookmarkedPosts((prev) => {
      const next = new Set(prev);
      nextPosts.forEach((p: Post) => {
        if (typeof p.bookmarked !== 'boolean') return;
        if (p.bookmarked) next.add(p.id);
        else next.delete(p.id);
      });
      AsyncStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const applyPostsFeed = useCallback((
    feed: 'for_you' | 'following',
    fetchedPosts: Post[],
    applyGen?: number,
  ): boolean => {
    const gen = postsGeneration(feed);
    const token = applyGen ?? gen.next();
    if (!gen.isCurrent(token)) return false;
    postsCacheByFeed.set(feed, fetchedPosts);
    commitPostsFeed(feed, fetchedPosts);
    return true;
  }, [commitPostsFeed]);

  const hydratePostsFeed = useCallback((
    feed: 'for_you' | 'following',
    cachedPosts: Post[],
  ) => {
    postsCacheByFeed.set(feed, cachedPosts);
    commitPostsFeed(feed, cachedPosts);
  }, [commitPostsFeed]);

  const fetchPosts = useCallback(async (
    feed: 'for_you' | 'following' = 'for_you',
    options?: FetchPostsOptions,
  ): Promise<boolean> => {
    await waitForFeedSnapshotBoot();
    // Dedupe by feed type only — token refresh must not open a parallel posts request.
    const inflightKey = feed;
    const inflight = postsFetchInflight.get(inflightKey);
    if (inflight) {
      await inflight;
      const cachedAfter = postsCacheByFeed.get(inflightKey);
      if (cachedAfter && activePostsFeed == null) {
        hydratePostsFeed(inflightKey, cachedAfter);
        return true;
      }
      return postsLastFetchOk.get(inflightKey) ?? Boolean(cachedAfter);
    }

    const cached = postsCacheByFeed.get(inflightKey);
    if (cached && activePostsFeed !== inflightKey) {
      hydratePostsFeed(inflightKey, cached);
    }
    if (
      cached &&
      shouldReuseFreshResult(postsLastSuccessAt.get(inflightKey), REFETCH_TTL_MS, options?.force)
    ) {
      return true;
    }

    if (isRateLimited()) {
      if (cached && activePostsFeed !== inflightKey) {
        hydratePostsFeed(inflightKey, cached);
      }
      return postsLastFetchOk.get(inflightKey) ?? Boolean(cached);
    }

    let succeeded = false;
    const applyGen = postsGeneration(inflightKey).next();
    const promise = (async () => {
      try {
        const qs = feed === 'following' ? '?feed=following' : '';
        const res = await fetchPublicFeed(`${API_BASE}/api/posts${qs}`, accessToken);
        const json = await res.json().catch(() => ({}));
        if (res.status === 429) {
          noteRateLimitFromResponse(res, json);
          // Keep existing posts — never clear on 429.
          return;
        }
        if (res.ok) {
          if (json.success && json.data?.posts) {
            const fetchedPosts = (json.data.posts as unknown[])
              .map(mapBackendPost)
              .filter((p: Post | null): p is Post => Boolean(p?.id));
            postsLastSuccessAt.set(inflightKey, Date.now());
            const applied = applyPostsFeed(inflightKey, fetchedPosts, applyGen);
            succeeded = applied;
            if (applied) {
              void patchFeedSnapshot(
                { posts: fetchedPosts },
                feedSnapshotOwnerId(user?.id, isAuthenticated),
              );
            }
          }
        }
      } catch (err) {
        console.warn('[AppContext] Failed to fetch posts:', err);
      }
    })().finally(() => {
      postsFetchInflight.delete(inflightKey);
      postsLastFetchOk.set(inflightKey, succeeded);
    });

    postsFetchInflight.set(inflightKey, promise);
    await promise;
    if (!succeeded && activePostsFeed == null) {
      const cachedAfter = postsCacheByFeed.get(inflightKey);
      if (cachedAfter) {
        hydratePostsFeed(inflightKey, cachedAfter);
        postsLastFetchOk.set(inflightKey, true);
        return true;
      }
    }
    return succeeded;
  }, [accessToken, applyPostsFeed, hydratePostsFeed, isAuthenticated, mapBackendPost, user?.id]);

  const lastRefetchAtRef = useRef(0);
  const lastUserRefetchAtRef = useRef(0);
  const refetchInflightRef = useRef<Promise<void> | null>(null);
  const bootstrapStartedRef = useRef(false);
  const lastAuthUserIdRef = useRef<string | null>(null);
  const fetchPostsRef = useRef(fetchPosts);
  const fetchListingsRef = useRef(fetchListings);
  fetchPostsRef.current = fetchPosts;
  fetchListingsRef.current = fetchListings;

  const refetchUser = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastUserRefetchAtRef.current < REFETCH_TTL_MS) {
      return;
    }
    lastUserRefetchAtRef.current = now;
    await fetchUserData();
  }, [fetchUserData]);

  const refetchData = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastRefetchAtRef.current < REFETCH_TTL_MS) {
      return;
    }
    if (refetchInflightRef.current && !force) {
      await refetchInflightRef.current;
      return;
    }
    if (!force && isRateLimited()) {
      return;
    }
    lastRefetchAtRef.current = now;
    lastUserRefetchAtRef.current = now;
    const promise = Promise.all([
      fetchUserData(),
      fetchListings({ force }),
      fetchPosts('for_you', { force }),
    ]).then(
      () => undefined,
    );
    refetchInflightRef.current = promise;
    await promise.finally(() => {
      if (refetchInflightRef.current === promise) {
        refetchInflightRef.current = null;
      }
    });
  }, [fetchUserData, fetchListings, fetchPosts]);

  const feedRetryRef = useRef<{
    count: number;
    timer: ReturnType<typeof setTimeout> | null;
    posts: boolean;
    listings: boolean;
  }>({
    count: 0,
    timer: null,
    posts: false,
    listings: false,
  });

  const scheduleFeedRetry = useCallback((failed?: { posts?: boolean; listings?: boolean }) => {
    const retry = feedRetryRef.current;
    if (failed?.posts) retry.posts = true;
    if (failed?.listings) retry.listings = true;
    if (!retry.posts && !retry.listings) return;
    if (retry.count >= FEED_RETRY_MAX || retry.timer) return;

    const delay = feedRetryDelayMs(retry.count);
    retry.timer = setTimeout(() => {
      retry.timer = null;
      retry.count += 1;
      const wantPosts = retry.posts;
      const wantListings = retry.listings;
      retry.posts = false;
      retry.listings = false;

      void (async () => {
        const [postsOk, listingsOk] = await Promise.all([
          wantPosts ? fetchPostsRef.current() : Promise.resolve(true),
          wantListings ? fetchListingsRef.current() : Promise.resolve(true),
        ]);
        if (postsOk && listingsOk) {
          retry.count = 0;
          return;
        }
        scheduleFeedRetry({
          posts: wantPosts && !postsOk,
          listings: wantListings && !listingsOk,
        });
      })();
    }, delay);
  }, []);

  const bootstrapFeeds = useCallback(async () => {
    if (bootstrapInflight) {
      await bootstrapInflight;
      return;
    }
    bootstrapInflight = (async () => {
      const [postsOk, listingsOk] = await Promise.all([
        fetchPostsRef.current(),
        fetchListingsRef.current(),
      ]);
      if (!postsOk || !listingsOk) {
        scheduleFeedRetry({ posts: !postsOk, listings: !listingsOk });
      } else {
        feedRetryRef.current.count = 0;
      }
    })().finally(() => {
      bootstrapInflight = null;
    });
    await bootstrapInflight;
  }, [scheduleFeedRetry]);

  // Public feed — hydrate disk snapshot, then skip GET when it is still network-fresh.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const ownerId = feedSnapshotOwnerId(user?.id, isAuthenticated);
        const snapshot = await readFeedSnapshot(ownerId);
        if (cancelled) return;
        lastAuthUserIdRef.current = ownerId;
        if (snapshot) {
          const plan = planFeedSnapshotHydration(snapshot);
          if (plan.posts) {
            postsCacheByFeed.set('for_you', plan.posts);
            activePostsFeed = 'for_you';
            postsLastSuccessAt.set('for_you', snapshot.savedAt);
            postsLastFetchOk.set('for_you', true);
            setPosts(plan.posts);
            prefetchRemoteImages(collectPostImageUris(plan.posts), 8);
          }
          if (plan.listings) {
            listingsLastSuccessAt = snapshot.savedAt;
            listingsLastFetchOk = true;
            setListingsState(plan.listings);
            prefetchRemoteImages(
              plan.listings.map((l) => l.thumbnailUrl || l.images?.[0]),
              8,
            );
          }
        }
      } finally {
        finishFeedSnapshotBoot();
        if (!cancelled && !bootstrapStartedRef.current) {
          bootstrapStartedRef.current = true;
          await bootstrapFeeds();
        }
      }
    })();
    return () => {
      cancelled = true;
      const retry = feedRetryRef.current;
      if (retry.timer) {
        clearTimeout(retry.timer);
        retry.timer = null;
      }
    };
    // Auth-ready once: refs keep fetch functions current without re-bootstrapping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  // User profile + authenticated feed metadata (liked/reposted)
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !accessToken) {
      const wasUser =
        Boolean(lastAuthUserIdRef.current) &&
        lastAuthUserIdRef.current !== FEED_SNAPSHOT_GUEST_OWNER;
      lastAuthUserIdRef.current = FEED_SNAPSHOT_GUEST_OWNER;
      if (!isAuthenticated) {
        setMe(DEFAULT_USER);
        setLikedPosts(new Set());
        setRepostedPosts(new Set());
        if (wasUser) void clearFeedSnapshot();
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      await waitForFeedSnapshotBoot();
      if (cancelled) return;
      const userId = String(user?.id ?? '');
      const previousId = lastAuthUserIdRef.current;
      lastAuthUserIdRef.current = userId;
      const switchedUser = previousId !== userId;

      void fetchUserData();

      // After token refresh (same user), skip feed reload when data is still fresh.
      const postsAge = Date.now() - (postsLastSuccessAt.get('for_you') ?? 0);
      const postsFresh = postsAge < REFETCH_TTL_MS && (postsLastFetchOk.get('for_you') ?? false);
      if (switchedUser) {
        if (bootstrapInflight) {
          void bootstrapInflight.then(() => {
            void fetchPosts('for_you', { force: true });
          });
          return;
        }
        void fetchPosts('for_you', { force: true });
        return;
      }
      if (!postsFresh) {
        if (bootstrapInflight) return;
        void fetchPosts('for_you');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, accessToken, user?.id, fetchUserData, fetchPosts]);

  const updateMe = useCallback(async (updates: Partial<User>): Promise<ActionResult> => {
    if (!isAuthenticated || !accessToken || !user) {
      return { ok: false, error: 'يجب تسجيل الدخول أولاً' };
    }
    try {
      let avatar = updates.avatar;
      let coverImage = updates.coverImage;
      let uploadWarning: string | undefined;

      // Prefer live token — AppState refresh after ImagePicker can rotate access tokens.
      const uploadToken = getAccessToken() ?? accessToken;

      if (needsUpload(avatar)) {
        try {
          avatar = await uploadImageFromUri(uploadToken, avatar, 'avatars');
        } catch (err) {
          uploadWarning =
            err instanceof Error ? err.message : 'تعذّر رفع صورة الملف الشخصي';
          avatar = undefined;
        }
      }
      if (needsUpload(coverImage)) {
        try {
          coverImage = await uploadImageFromUri(
            getAccessToken() ?? uploadToken,
            coverImage,
            'avatars',
          );
        } catch (err) {
          uploadWarning =
            err instanceof Error ? err.message : 'تعذّر رفع صورة الغلاف';
          coverImage = undefined;
        }
      }

      const body: Record<string, unknown> = {};
      if (updates.displayName !== undefined) body.displayName = updates.displayName;
      if (updates.arabicName !== undefined) body.arabicName = updates.arabicName;
      if (updates.username !== undefined) body.username = updates.username;
      if (updates.bio !== undefined) body.bio = updates.bio;
      if (updates.country !== undefined) body.country = updates.country;
      if (avatar !== undefined) body.avatar = avatar;
      if (coverImage !== undefined) body.coverImage = coverImage;

      if (Object.keys(body).length === 0) {
        return {
          ok: false,
          error: uploadWarning || 'لا توجد تغييرات للحفظ',
        };
      }

      const res = await authFetch(`${API_BASE}/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setMe(mapBackendUser(json.data));
          return uploadWarning ? { ok: true, error: uploadWarning } : { ok: true };
        }
      }
      return { ok: false, error: uploadWarning ?? (await parseApiError(res)) };
    } catch (err) {
      console.warn('[AppContext] Update user profile failed:', err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'فشل حفظ التغييرات',
      };
    }
  }, [isAuthenticated, accessToken, user, mapBackendUser]);

  const addPost = useCallback(async (postData: Omit<Post, 'id' | 'author' | 'likes' | 'reposts' | 'comments' | 'postedAt' | 'liked'>): Promise<boolean> => {
    if (!isAuthenticated || !accessToken) return false;
    try {
      const res = await authFetch(`${API_BASE}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const mapped = mapBackendPost(json.data);
          if (mapped) setPosts((prev) => [mapped, ...prev]);
          return Boolean(mapped);
        }
      }
    } catch (err) {
      console.warn('[AppContext] Add post failed:', err);
    }
    return false;
  }, [isAuthenticated, accessToken, mapBackendPost]);

  const addListing = useCallback(async (listingData: any): Promise<ActionResult> => {
    if (!isAuthenticated || !accessToken) {
      return { ok: false, error: 'يجب تسجيل الدخول أولاً' };
    }
    try {
      const res = await authFetch(`${API_BASE}/api/listings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(listingData),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const mapped = mapBackendListing(json.data);
          if (mapped) setListingsState((prev) => [mapped, ...prev]);
          return mapped ? { ok: true, listingId: mapped.id } : { ok: false, error: 'استجابة غير صالحة' };
        }
      }
      return { ok: false, error: sanitizeListingLimitMessage(await parseApiError(res)) };
    } catch (err) {
      console.warn('[AppContext] Add listing failed:', err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'فشل نشر الإعلان',
      };
    }
  }, [isAuthenticated, accessToken, mapBackendListing]);

  const updateListing = useCallback(async (listingId: string, listingData: any): Promise<ActionResult> => {
    if (!isAuthenticated || !accessToken) {
      return { ok: false, error: 'يجب تسجيل الدخول أولاً' };
    }
    try {
      const res = await authFetch(`${API_BASE}/api/listings/${listingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(listingData),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const mapped = mapBackendListing(json.data);
          if (mapped) {
            setListingsState((prev) => prev.map((item) => (item.id === listingId ? mapped : item)));
            return { ok: true, listingId: mapped.id };
          }
          return { ok: false, error: 'استجابة غير صالحة' };
        }
      }
      return { ok: false, error: sanitizeListingLimitMessage(await parseApiError(res)) };
    } catch (err) {
      console.warn('[AppContext] Update listing failed:', err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'فشل تعديل الإعلان',
      };
    }
  }, [isAuthenticated, accessToken, mapBackendListing]);

  const removeListing = useCallback(async (
    listingId: string,
    options: { sold: boolean; reason: string },
  ): Promise<ActionResult> => {
    if (!isAuthenticated || !accessToken) {
      return { ok: false, error: 'يجب تسجيل الدخول أولاً' };
    }
    try {
      const res = await authFetch(`${API_BASE}/api/listings/${listingId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sold: Boolean(options?.sold),
          reason: options?.reason ?? '',
        }),
      });
      if (res.ok) {
        setListingsState((prev) => prev.filter((l) => l.id !== listingId));
        return { ok: true };
      }
      return { ok: false, error: await parseApiError(res) };
    } catch (err) {
      console.warn('[AppContext] Delete listing failed:', err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'فشل حذف الإعلان',
      };
    }
  }, [isAuthenticated, accessToken]);

  const toggleLike = useCallback(async (postId: string) => {
    if (!isAuthenticated || !accessToken) return;
    await runExclusive(`like:${postId}`, async () => {
      let wasLiked = false;
      let previousLikes = 0;
      setLikedPosts((prev) => {
        wasLiked = prev.has(postId);
        const next = new Set(prev);
        if (wasLiked) next.delete(postId);
        else next.add(postId);
        return next;
      });
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          previousLikes = p.likes;
          return {
            ...p,
            liked: !wasLiked,
            likes: wasLiked ? Math.max(0, p.likes - 1) : p.likes + 1,
          };
        }),
      );
      try {
        const res = await authFetch(`${API_BASE}/api/posts/${postId}/like`, {
          method: 'POST',
        });
        const json = res.ok ? await res.json() : null;
        if (!res.ok || !json?.success) throw new Error('like_failed');
        const isLikedNow = Boolean(json.data?.liked);
        setLikedPosts((prev) => {
          const next = new Set(prev);
          if (isLikedNow) next.add(postId);
          else next.delete(postId);
          return next;
        });
        patchPost(postId, { liked: isLikedNow });
      } catch (err) {
        console.warn('[AppContext] Toggle like failed:', err);
        setLikedPosts((prev) => {
          const next = new Set(prev);
          if (wasLiked) next.add(postId);
          else next.delete(postId);
          return next;
        });
        patchPost(postId, { liked: wasLiked, likes: previousLikes });
      }
    });
  }, [isAuthenticated, accessToken, patchPost]);

  const toggleRepost = useCallback(async (postId: string) => {
    if (!isAuthenticated || !accessToken) return;
    await runExclusive(`repost:${postId}`, async () => {
      let wasReposted = false;
      let previousReposts = 0;
      setRepostedPosts((prev) => {
        wasReposted = prev.has(postId);
        const next = new Set(prev);
        if (wasReposted) next.delete(postId);
        else next.add(postId);
        return next;
      });
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          previousReposts = p.reposts;
          return {
            ...p,
            reposted: !wasReposted,
            reposts: wasReposted ? Math.max(0, p.reposts - 1) : p.reposts + 1,
          };
        }),
      );
      try {
        const res = await authFetch(`${API_BASE}/api/posts/${postId}/repost`, {
          method: 'POST',
        });
        const json = res.ok ? await res.json() : null;
        if (!res.ok || !json?.success) throw new Error('repost_failed');
        const isRepostedNow = Boolean(json.data?.reposted);
        setRepostedPosts((prev) => {
          const next = new Set(prev);
          if (isRepostedNow) next.add(postId);
          else next.delete(postId);
          return next;
        });
        patchPost(postId, { reposted: isRepostedNow });
      } catch (err) {
        console.warn('[AppContext] Toggle repost failed:', err);
        setRepostedPosts((prev) => {
          const next = new Set(prev);
          if (wasReposted) next.add(postId);
          else next.delete(postId);
          return next;
        });
        patchPost(postId, { reposted: wasReposted, reposts: previousReposts });
      }
    });
  }, [isAuthenticated, accessToken, patchPost]);

  const toggleBookmark = useCallback(async (postId: string) => {
    if (!isAuthenticated || !accessToken) return;
    await runExclusive(`bookmark:${postId}`, async () => {
      let wasBookmarked = false;
      setBookmarkedPosts((prev) => {
        wasBookmarked = prev.has(postId);
        const next = new Set(prev);
        if (wasBookmarked) next.delete(postId);
        else next.add(postId);
        persistBookmarks(next);
        return next;
      });
      patchPost(postId, { bookmarked: !wasBookmarked });
      try {
        const res = await authFetch(`${API_BASE}/api/posts/${postId}/bookmark`, {
          method: 'POST',
        });
        const json = res.ok ? await res.json() : null;
        if (!res.ok || !json?.success) throw new Error('bookmark_failed');
        const isBookmarkedNow = Boolean(json.data?.bookmarked);
        setBookmarkedPosts((prev) => {
          const next = new Set(prev);
          if (isBookmarkedNow) next.add(postId);
          else next.delete(postId);
          persistBookmarks(next);
          return next;
        });
        patchPost(postId, { bookmarked: isBookmarkedNow });
      } catch (err) {
        console.warn('[AppContext] Toggle bookmark failed:', err);
        setBookmarkedPosts((prev) => {
          const next = new Set(prev);
          if (wasBookmarked) next.add(postId);
          else next.delete(postId);
          persistBookmarks(next);
          return next;
        });
        patchPost(postId, { bookmarked: wasBookmarked });
      }
    });
  }, [isAuthenticated, accessToken, patchPost, persistBookmarks]);

  const addComment = useCallback(async (postId: string, content: string): Promise<boolean> => {
    if (!isAuthenticated || !accessToken || !content.trim()) return false;
    try {
      const res = await authFetch(`${API_BASE}/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setPosts((prev) =>
            prev.map((p) => (p.id === postId ? { ...p, comments: p.comments + 1 } : p)),
          );
          return true;
        }
      }
    } catch (err) {
      console.warn('[AppContext] Add comment failed:', err);
    }
    return false;
  }, [isAuthenticated, accessToken]);

  const updatePost = useCallback(async (
    postId: string,
    data: { content: string; arabicContent: string; image?: string | null; images?: string[] },
  ): Promise<boolean> => {
    if (!isAuthenticated || !accessToken) return false;
    try {
      const res = await authFetch(`${API_BASE}/api/posts/${postId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setPosts((prev) =>
            prev.map((p) =>
              p.id === postId
                ? {
                    ...p,
                    content: json.data.content,
                    arabicContent: json.data.arabicContent,
                    image: json.data.image ?? p.image,
                    images:
                      Array.isArray(json.data.images) && json.data.images.length > 0
                        ? json.data.images
                        : json.data.image
                          ? [json.data.image]
                          : p.images,
                  }
                : p,
            ),
          );
          return true;
        }
      }
    } catch (err) {
      console.warn('[AppContext] Update post failed:', err);
    }
    return false;
  }, [isAuthenticated, accessToken]);

  const deletePost = useCallback(async (postId: string): Promise<ActionResult> => {
    if (!isAuthenticated || !accessToken) {
      return { ok: false, error: 'يجب تسجيل الدخول أولاً' };
    }
    try {
      const res = await authFetch(`${API_BASE}/api/posts/${postId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== postId));
        setLikedPosts((prev) => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
        setRepostedPosts((prev) => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
        return { ok: true };
      }
      return { ok: false, error: await parseApiError(res) };
    } catch (err) {
      console.warn('[AppContext] Delete post failed:', err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'فشل حذف المنشور',
      };
    }
  }, [isAuthenticated, accessToken]);

  const userValue = useMemo<AppUserContextValue>(
    () => ({ me, updateMe }),
    [me, updateMe],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      me,
      updateMe,
      posts,
      fetchPosts,
      fetchListings,
      addPost,
      updatePost,
      deletePost,
      listings: listingsState,
      addListing,
      updateListing,
      likedPosts,
      repostedPosts,
      bookmarkedPosts,
      toggleLike,
      toggleRepost,
      toggleBookmark,
      setPostViews,
      addComment,
      removeListing,
      refetchData,
      refetchUser,
    }),
    [
      me,
      updateMe,
      posts,
      fetchPosts,
      fetchListings,
      addPost,
      updatePost,
      deletePost,
      listingsState,
      addListing,
      updateListing,
      likedPosts,
      repostedPosts,
      bookmarkedPosts,
      toggleLike,
      toggleRepost,
      toggleBookmark,
      setPostViews,
      addComment,
      removeListing,
      refetchData,
      refetchUser,
    ],
  );

  return (
    <AppUserContext.Provider value={userValue}>
      <AppContext.Provider value={value}>{children}</AppContext.Provider>
    </AppUserContext.Provider>
  );
}
