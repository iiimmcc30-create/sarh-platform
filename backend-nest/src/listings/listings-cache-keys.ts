/**
 * Single source of truth for the public listings feed cache keys.
 *
 * The writer (ListingsService.list) and every invalidator (listings, admin,
 * boost, promotion, payments) must build keys / patterns from here so the version can never drift again
 * (previously the writer used `listings:v3:` while invalidation cleared
 * `listings:v2:*`, leaving stale pages until the TTL expired).
 */
export const LISTINGS_FEED_CACHE_VERSION = 'v3';

export const LISTINGS_FEED_CACHE_PREFIX = `listings:${LISTINGS_FEED_CACHE_VERSION}:`;

/** Redis SCAN MATCH pattern covering every cached listings feed page. */
export const LISTINGS_FEED_CACHE_PATTERN = `${LISTINGS_FEED_CACHE_PREFIX}*`;

/** Kept structural (no imports) so any module can use this file without cycles. */
export interface ListingsFeedCacheKeyParts {
  cursor?: string;
  category?: string;
  country?: string;
  featured?: boolean;
  sellerId?: string;
  sort: 'newest' | 'oldest';
}

/** Cache key for one public listings feed page (field order is part of the key). */
export function listingsFeedCacheKey(parts: ListingsFeedCacheKeyParts): string {
  const { cursor, category, country, featured, sellerId, sort } = parts;
  return `${LISTINGS_FEED_CACHE_PREFIX}${JSON.stringify({ cursor, category, country, featured, sellerId, sort })}`;
}
