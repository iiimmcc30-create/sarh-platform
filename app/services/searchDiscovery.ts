import { ensureApiReachable } from './api';
import { dedupeInflight, shouldReuseFreshResult } from './requestCoordination';
import { mapListingFromSearch } from './unifiedSearch';

export type ExploreSectionType =
  | 'trending_topics'
  | 'accounts'
  | 'listings'
  | 'news'
  | 'feed_categories'
  | 'feed_suppliers';

export type ExploreTrendingItem = {
  tag: string;
  kind?: string;
  count?: number;
  score?: number;
};

export type ExploreAccountItem = {
  id: string;
  username: string;
  displayName?: string;
  arabicName?: string;
  avatar?: string;
  verified?: boolean;
  followers?: number;
};

export type ExploreNewsItem = {
  id: string;
  titleAr: string;
  bodyAr?: string;
  imageUrl?: string;
  publishedAt?: string;
};

export type ExploreCategoryItem = {
  id: string;
  nameAr: string;
  slug?: string;
  icon?: string | null;
  emoji?: string | null;
};

export type ExploreSupplierItem = {
  id: string;
  nameAr: string;
  logo?: string | null;
  cityAr?: string;
  verified?: boolean;
};

export type ExploreSection = {
  type: ExploreSectionType;
  title: string;
  items: unknown[];
};

export type ExploreFeedResponse = {
  sections: ExploreSection[];
};

export type TrendingFeedResponse = {
  trending: Array<{
    tag: string;
    kind?: string;
    count: number;
    score?: number;
    uniqueAuthors?: number;
    engagement?: number;
  }>;
  window?: string;
};

const EXPLORE_TTL_MS = 60_000;
const TRENDING_TTL_MS = 90_000;

let exploreCache: { at: number; data: ExploreFeedResponse } | null = null;
let trendingCache: { at: number; key: string; data: TrendingFeedResponse } | null = null;

export function resetSearchDiscoveryCaches() {
  exploreCache = null;
  trendingCache = null;
}

export async function fetchSearchExplore(options?: {
  force?: boolean;
}): Promise<ExploreFeedResponse> {
  const force = options?.force === true;
  if (!force && exploreCache && shouldReuseFreshResult(exploreCache.at, EXPLORE_TTL_MS)) {
    return exploreCache.data;
  }

  return dedupeInflight('GET:/api/search/explore', async () => {
    const base = await ensureApiReachable();
    const res = await fetch(`${base}/api/search/explore`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      return exploreCache?.data ?? { sections: [] };
    }
    const data = (json.data ?? { sections: [] }) as ExploreFeedResponse;
    if (!Array.isArray(data.sections)) data.sections = [];
    exploreCache = { at: Date.now(), data };
    return data;
  });
}

export async function fetchSearchTrending(options?: {
  force?: boolean;
  window?: '6h' | '24h' | '7d';
  limit?: number;
}): Promise<TrendingFeedResponse> {
  const window = options?.window ?? '24h';
  const limit = options?.limit ?? 16;
  const key = `${window}:${limit}`;
  const force = options?.force === true;
  if (
    !force &&
    trendingCache &&
    trendingCache.key === key &&
    shouldReuseFreshResult(trendingCache.at, TRENDING_TTL_MS)
  ) {
    return trendingCache.data;
  }

  return dedupeInflight(`GET:/api/search/trending:${key}`, async () => {
    const base = await ensureApiReachable();
    const qs = new URLSearchParams({ window, limit: String(limit) });
    const res = await fetch(`${base}/api/search/trending?${qs.toString()}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      return trendingCache?.data ?? { trending: [] };
    }
    const data = (json.data ?? { trending: [] }) as TrendingFeedResponse;
    if (!Array.isArray(data.trending)) data.trending = [];
    trendingCache = { at: Date.now(), key, data };
    return data;
  });
}

export { mapListingFromSearch };
