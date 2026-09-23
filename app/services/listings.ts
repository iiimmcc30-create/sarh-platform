import { listingVideoUrl } from '@/lib/listingMedia';
import { resolveMediaUrl } from '@/services/media';
import { ensureApiReachable } from './api';
import { fetchPublicFeed } from './fetchPublicFeed';
import { shouldReuseFreshResult } from './requestCoordination';
import { countries, type Listing, type Country } from './types';
import { managedSeller, isManagedListing } from '@/lib/managedListing';

type BackendListing = {
  id: string;
  title: string;
  arabicTitle: string;
  price: number;
  currency?: string;
  category: Listing['category'];
  categoryId?: string | null;
  subcategoryId?: string | null;
  marketCategory?: {
    id: string;
    nameAr: string;
    slug: string;
    requiresWeight?: boolean;
  } | null;
  marketSubcategory?: {
    id: string;
    nameAr: string;
    slug: string;
    requiresWeight?: boolean;
  } | null;
  breed?: string;
  age?: string;
  location: string;
  arabicLocation: string;
  country: Listing['country'];
  contactPhone?: string;
  weightKg?: number;
  images?: string[];
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  description: string;
  arabicDescription: string;
  featured?: boolean;
  pinned?: boolean;
  promoted?: boolean;
  promotedUntil?: string;
  promotionWeight?: number;
  views?: number;
  editCount?: number;
  createdAt: string;
  origin?: 'USER' | 'ADMIN_MANAGED';
  displayUsername?: string | null;
  displaySellerName?: string | null;
  displayPhone?: string | null;
  displayRegion?: string | null;
  seller?: {
    id: string;
    username: string;
    displayName?: string;
    arabicName?: string;
    avatar?: string;
    verified?: boolean;
    country?: string;
  };
};

function mapListing(l: BackendListing): Listing {
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
    categoryId: l.categoryId ?? l.marketCategory?.id,
    subcategoryId: l.subcategoryId ?? l.marketSubcategory?.id,
    categoryNameAr: l.marketCategory?.nameAr,
    subcategoryNameAr: l.marketSubcategory?.nameAr,
    breed: l.breed || '',
    age: l.age || '',
    location: l.location,
    arabicLocation: l.arabicLocation,
    country: l.country,
    contactPhone: l.contactPhone,
    weightKg: l.weightKg,
    requiresWeight:
      l.marketCategory?.requiresWeight === true ||
      l.marketSubcategory?.requiresWeight === true ||
      l.category === 'slaughter',
    images: (l.images ?? [])
      .map((uri) => {
        const raw = typeof uri === 'string' ? uri.trim() : '';
        return resolveMediaUrl(raw) ?? raw;
      })
      .filter((uri) => uri.length > 0),
    videoUrl: resolveMediaUrl(
      listingVideoUrl({
        images: l.images ?? [],
        videoUrl: l.videoUrl ?? undefined,
      }),
    ),
    thumbnailUrl: resolveMediaUrl(l.thumbnailUrl?.trim() || undefined),
    description: l.description,
    arabicDescription: l.arabicDescription,
    origin: l.origin === 'ADMIN_MANAGED' ? 'ADMIN_MANAGED' : 'USER',
    displayUsername: l.displayUsername ?? undefined,
    displaySellerName: l.displaySellerName ?? undefined,
    displayPhone: l.displayPhone ?? undefined,
    displayRegion: l.displayRegion ?? undefined,
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
    promotedUntil: l.promotedUntil,
    promotionWeight: l.promotionWeight,
    postedAt: new Date(l.createdAt).toLocaleDateString('ar-SA'),
    createdAt: l.createdAt,
    views: typeof l.views === 'number' ? l.views : undefined,
    editCount: typeof l.editCount === 'number' ? l.editCount : 0,
  };
}

export type ListingSearchParams = {
  search?: string;
  category?: string;
  categoryId?: string;
  subcategoryId?: string;
  country?: string;
  minPrice?: number;
  maxPrice?: number;
  cursor?: string;
  sellerId?: string;
  featured?: boolean;
};

export type ListingSearchPage = {
  listings: Listing[];
  nextCursor: string | null;
  hasMore: boolean;
};

/** Same window as posts/home — Market can reuse a fresh bootstrap page. */
export const LISTINGS_BOOTSTRAP_TTL_MS = 60_000;

type ListingsBootstrapCache = {
  page: ListingSearchPage;
  fetchedAt: number;
  authTag: 'auth' | 'guest';
};

let listingsBootstrap: ListingsBootstrapCache | null = null;

/** Test-only reset. */
export function resetListingsBootstrapCache() {
  listingsBootstrap = null;
}

export function rememberListingsBootstrapPage(
  page: ListingSearchPage,
  accessToken?: string | null,
) {
  listingsBootstrap = {
    page,
    fetchedAt: Date.now(),
    authTag: accessToken ? 'auth' : 'guest',
  };
}

/** Fresh unfiltered first page from AppContext bootstrap, or null. */
export function getBootstrappedListingsPage(
  accessToken?: string | null,
): ListingSearchPage | null {
  if (!listingsBootstrap) return null;
  const tag = accessToken ? 'auth' : 'guest';
  if (listingsBootstrap.authTag !== tag) return null;
  if (!shouldReuseFreshResult(listingsBootstrap.fetchedAt, LISTINGS_BOOTSTRAP_TTL_MS)) {
    return null;
  }
  if (listingsBootstrap.page.listings.length === 0) return null;
  return listingsBootstrap.page;
}

/** True when params match the default Market / AppContext listings first page. */
export function isDefaultListingsFirstPage(params: ListingSearchParams = {}): boolean {
  return (
    !(params.search && params.search.length >= 2) &&
    !params.category &&
    !params.categoryId &&
    !params.subcategoryId &&
    !params.country &&
    params.minPrice == null &&
    params.maxPrice == null &&
    !params.cursor &&
    !params.sellerId &&
    !params.featured
  );
}

export function buildListingsFeedUrl(
  base: string,
  params: ListingSearchParams = {},
): string {
  const qs = new URLSearchParams();
  if (params.search && params.search.length >= 2) qs.set('search', params.search);
  if (params.category) qs.set('category', params.category);
  if (params.categoryId) qs.set('categoryId', params.categoryId);
  if (params.subcategoryId) qs.set('subcategoryId', params.subcategoryId);
  if (params.country) qs.set('country', params.country);
  if (params.minPrice != null) qs.set('minPrice', String(params.minPrice));
  if (params.maxPrice != null) qs.set('maxPrice', String(params.maxPrice));
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.sellerId) qs.set('sellerId', params.sellerId);
  if (params.featured) qs.set('featured', 'true');

  const root = base.replace(/\/$/, '');
  const query = qs.toString();
  return query ? `${root}/api/listings?${query}` : `${root}/api/listings`;
}

/** Safety cap: 50 pages × 20 = 1000 listings for a single seller. */
export const SELLER_LISTINGS_MAX_PAGES = 50;

export function shouldFetchNextListingPage(opts: {
  hasMore: boolean;
  nextCursor: string | null | undefined;
  loading: boolean;
  loadingMore: boolean;
}): boolean {
  return Boolean(
    opts.hasMore && opts.nextCursor && !opts.loading && !opts.loadingMore,
  );
}

export async function searchListingsPage(
  params: ListingSearchParams,
  accessToken?: string | null,
): Promise<ListingSearchPage> {
  if (isDefaultListingsFirstPage(params)) {
    const boot = getBootstrappedListingsPage(accessToken);
    if (boot) return boot;
  }

  const base = await ensureApiReachable();
  const url = buildListingsFeedUrl(base, params);
  const res = await fetchPublicFeed(url, accessToken);
  if (!res.ok) {
    throw new Error('listings_fetch_failed');
  }

  const json = await res.json();
  if (!json.success || !Array.isArray(json.data?.listings)) {
    throw new Error('listings_fetch_failed');
  }
  const page: ListingSearchPage = {
    listings: json.data.listings.map(mapListing),
    nextCursor: typeof json.data.nextCursor === 'string' ? json.data.nextCursor : null,
    hasMore: json.data.hasMore === true,
  };
  if (isDefaultListingsFirstPage(params)) {
    const usable = page.listings.filter((row) => row.country !== 'EG');
    if (usable.length > 0) {
      rememberListingsBootstrapPage(
        { listings: usable, nextCursor: page.nextCursor, hasMore: page.hasMore },
        accessToken,
      );
    }
  }
  return page;
}

export async function searchListings(
  params: ListingSearchParams,
  accessToken?: string | null,
): Promise<Listing[]> {
  const page = await searchListingsPage(params, accessToken);
  return page.listings;
}

export function mergeListingPages(existing: Listing[], incoming: Listing[]): Listing[] {
  if (existing.length === 0) return incoming;
  const seen = new Set(existing.map((l) => l.id));
  const extra = incoming.filter((l) => !seen.has(l.id));
  return extra.length === 0 ? existing : [...existing, ...extra];
}

export async function searchAllSellerListings(
  sellerId: string,
  accessToken?: string | null,
  maxPages: number = SELLER_LISTINGS_MAX_PAGES,
): Promise<Listing[]> {
  const collected: Listing[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await searchListingsPage({ sellerId, cursor }, accessToken);
    collected.push(...result.listings);
    if (!result.hasMore || !result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return collected;
}
