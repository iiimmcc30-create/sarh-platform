import { ensureApiReachable } from './api';
import { listingVideoUrl } from '@/lib/listingMedia';
import { resolveMediaUrl } from './media';
import { mapPostFromApi } from './posts';
import type { Listing, Country, Post } from './types';
import { countries } from './types';
import { isManagedListing, managedSeller } from '@/lib/managedListing';
import { dedupeInflight, shouldReuseFreshResult } from './requestCoordination';

export type SearchContentType =
  | 'all'
  | 'listings'
  | 'posts'
  | 'news'
  | 'services'
  | 'users';

export type SearchResultItem = {
  type: Exclude<SearchContentType, 'all'>;
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  relevance: number;
  createdAt?: string;
  data: Record<string, unknown>;
};

export type SearchGroup = {
  type: Exclude<SearchContentType, 'all'>;
  items: SearchResultItem[];
  page: number;
  limit: number;
  hasMore: boolean;
};

export type UnifiedSearchResponse = {
  query: string;
  type: SearchContentType;
  groups: SearchGroup[];
  durationMs?: number;
};

export type SearchSuggestion = {
  text: string;
  kind: string;
};

const SEARCH_TTL_MS = 45_000;
const SUGGEST_TTL_MS = 90_000;
const CACHE_MAX = 40;

type Timed<T> = { at: number; data: T };
const searchCache = new Map<string, Timed<UnifiedSearchResponse>>();
const suggestCache = new Map<string, Timed<SearchSuggestion[]>>();

function remember<T>(map: Map<string, Timed<T>>, key: string, data: T) {
  if (map.size >= CACHE_MAX) {
    const oldest = map.keys().next().value;
    if (oldest) map.delete(oldest);
  }
  map.set(key, { at: Date.now(), data });
}

export function resetUnifiedSearchCache() {
  searchCache.clear();
  suggestCache.clear();
}

function searchCacheKey(params: {
  q: string;
  type?: SearchContentType;
  page?: number;
  limit?: number;
  categoryId?: string;
  subcategoryId?: string;
  country?: string;
  minPrice?: number;
  maxPrice?: number;
  region?: string;
}): string {
  return [
    'search',
    params.q.trim(),
    params.type ?? 'all',
    params.page ?? 1,
    params.limit ?? 20,
    params.categoryId ?? '',
    params.subcategoryId ?? '',
    params.country ?? '',
    params.minPrice ?? '',
    params.maxPrice ?? '',
    params.region ?? '',
  ].join(':');
}

type BackendListing = {
  id: string;
  title: string;
  arabicTitle: string;
  price: number;
  currency?: string;
  category: Listing['category'];
  breed?: string;
  age?: string;
  location: string;
  arabicLocation: string;
  country: Listing['country'];
  images?: string[];
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  description: string;
  arabicDescription: string;
  featured?: boolean;
  pinned?: boolean;
  promoted?: boolean;
  promotionWeight?: number;
  createdAt: string;
  origin?: 'USER' | 'ADMIN_MANAGED';
  displayUsername?: string | null;
  displaySellerName?: string | null;
  seller?: {
    id: string;
    username: string;
    displayName?: string;
    arabicName?: string;
    avatar?: string;
    verified?: boolean;
    country?: string;
  };
  marketCategory?: { id: string; nameAr: string; requiresWeight?: boolean } | null;
  marketSubcategory?: { id: string; nameAr: string; requiresWeight?: boolean } | null;
};

function mapListingFromSearch(data: Record<string, unknown>): Listing | null {
  const l = data as unknown as BackendListing;
  if (!l?.id) return null;

  const managed = isManagedListing(l);
  const sellerCountry: Country =
    !managed && l.seller?.country && l.seller.country in countries
      ? (l.seller.country as Country)
      : 'SA';

  return {
    id: l.id,
    title: l.title,
    arabicTitle: l.arabicTitle,
    price: l.price,
    currency: l.currency || 'SAR',
    category: l.category,
    categoryId: l.marketCategory?.id,
    subcategoryId: l.marketSubcategory?.id,
    categoryNameAr: l.marketCategory?.nameAr,
    subcategoryNameAr: l.marketSubcategory?.nameAr,
    breed: l.breed || '',
    age: l.age || '',
    location: l.location,
    arabicLocation: l.arabicLocation,
    country: l.country,
    requiresWeight:
      l.marketCategory?.requiresWeight === true ||
      l.marketSubcategory?.requiresWeight === true ||
      l.category === 'slaughter',
    images: (l.images ?? [])
      .map((uri) => resolveMediaUrl(typeof uri === 'string' ? uri : '') ?? uri)
      .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0),
    videoUrl: resolveMediaUrl(
      listingVideoUrl({
        images: l.images ?? [],
        videoUrl: l.videoUrl ?? undefined,
      }) ?? undefined,
    ),
    thumbnailUrl: resolveMediaUrl(l.thumbnailUrl?.trim() || undefined),
    description: l.description,
    arabicDescription: l.arabicDescription,
    origin: managed ? 'ADMIN_MANAGED' : 'USER',
    displayUsername: l.displayUsername ?? undefined,
    displaySellerName: l.displaySellerName ?? undefined,
    seller: managed
      ? managedSeller(l)
      : {
      id: l.seller!.id,
      username: l.seller!.username,
      displayName: l.seller!.displayName || '',
      arabicName: l.seller!.arabicName || '',
      avatar: l.seller!.avatar,
      verified: l.seller!.verified ?? false,
      followers: 0,
      following: 0,
      rating: null,
      reviewCount: 0,
      country: sellerCountry,
      bio: '',
    },
    featured: l.featured ?? false,
    pinned: l.pinned ?? false,
    promoted: l.promoted ?? false,
    promotionWeight: l.promotionWeight,
    postedAt: l.createdAt ? new Date(l.createdAt).toLocaleDateString('ar-SA') : '',
    createdAt: l.createdAt,
    views: undefined,
    editCount: 0,
  };
}

export { mapListingFromSearch };

export function mapPostFromSearch(data: Record<string, unknown>): Post | null {
  return mapPostFromApi(data);
}

export async function unifiedSearch(params: {
  q: string;
  type?: SearchContentType;
  page?: number;
  limit?: number;
  categoryId?: string;
  subcategoryId?: string;
  country?: string;
  minPrice?: number;
  maxPrice?: number;
  region?: string;
  signal?: AbortSignal;
}): Promise<UnifiedSearchResponse> {
  const key = searchCacheKey(params);
  const cached = searchCache.get(key);
  if (cached && shouldReuseFreshResult(cached.at, SEARCH_TTL_MS)) {
    return cached.data;
  }

  const load = () =>
    dedupeInflight(key, async () => {
      const base = await ensureApiReachable();
      const qs = new URLSearchParams();
      qs.set('q', params.q.trim());
      if (params.type && params.type !== 'all') qs.set('type', params.type);
      if (params.page) qs.set('page', String(params.page));
      if (params.limit) qs.set('limit', String(params.limit));
      if (params.categoryId) qs.set('categoryId', params.categoryId);
      if (params.subcategoryId) qs.set('subcategoryId', params.subcategoryId);
      if (params.country) qs.set('country', params.country);
      if (params.minPrice != null) qs.set('minPrice', String(params.minPrice));
      if (params.maxPrice != null) qs.set('maxPrice', String(params.maxPrice));
      if (params.region) qs.set('region', params.region);

      const res = await fetch(`${base}/api/search?${qs.toString()}`, {
        signal: params.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.messageAr || json.message || 'تعذّر إكمال البحث');
      }
      const data = json.data as UnifiedSearchResponse;
      remember(searchCache, key, data);
      return data;
    });

  try {
    return await load();
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError' && params.signal && !params.signal.aborted) {
      return load();
    }
    throw err;
  }
}

export async function fetchSearchSuggestions(
  q: string,
  limit = 8,
  signal?: AbortSignal,
): Promise<SearchSuggestion[]> {
  if (q.trim().length < 2) return [];
  const key = `suggest:${q.trim()}:${limit}`;
  const cached = suggestCache.get(key);
  if (cached && shouldReuseFreshResult(cached.at, SUGGEST_TTL_MS)) {
    return cached.data;
  }

  const load = () =>
    dedupeInflight(key, async () => {
      const base = await ensureApiReachable();
      const qs = new URLSearchParams({ q: q.trim(), limit: String(limit) });
      const res = await fetch(`${base}/api/search/suggest?${qs.toString()}`, { signal });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) return [];
      const suggestions = (json.data?.suggestions ?? []) as SearchSuggestion[];
      remember(suggestCache, key, suggestions);
      return suggestions;
    });

  try {
    return await load();
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError' && signal && !signal.aborted) {
      return load();
    }
    throw err;
  }
}

export async function fetchTrendingTags(): Promise<Array<{ tag: string; count: number }>> {
  return dedupeInflight('GET:/api/search/trending:24h:16', async () => {
    const base = await ensureApiReachable();
    const qs = new URLSearchParams({ window: '24h', limit: '16' });
    const res = await fetch(`${base}/api/search/trending?${qs.toString()}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) return [];
    return json.data?.trending ?? [];
  });
}
