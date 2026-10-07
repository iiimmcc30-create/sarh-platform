import type { Listing } from '@/services/types';
import { searchListingsPage, type ListingSearchParams } from '@/services/listings';

/** Tiles per row in the «إعلانات مشابهة» grid. */
export const SIMILAR_LISTINGS_COLUMNS = 3;

/** Max tiles under a listing: 4 rows of 3. */
export const SIMILAR_LISTINGS_LIMIT = 12;

type SimilarSource = Pick<
  Listing,
  'id' | 'category' | 'categoryId' | 'subcategoryId' | 'country' | 'location' | 'arabicLocation'
>;

/**
 * Narrowest → broadest query on the existing GET /api/listings feed (active,
 * non-deleted, blocked sellers already filtered server-side). No new endpoint.
 */
export function similarListingsQueries(listing: SimilarSource): ListingSearchParams[] {
  const queries: ListingSearchParams[] = [];
  if (listing.subcategoryId) queries.push({ subcategoryId: listing.subcategoryId });
  if (listing.categoryId) queries.push({ categoryId: listing.categoryId });
  if (listing.category) queries.push({ category: listing.category });
  return queries;
}

function placeKey(listing: Pick<Listing, 'location' | 'arabicLocation'>): string {
  return String(listing.arabicLocation || listing.location || '').trim();
}

/**
 * Drop the current listing, duplicates and other-country rows; same-city rows
 * first (stable), capped to `limit`.
 */
export function pickSimilarListings(
  current: SimilarSource,
  candidates: Listing[],
  limit = SIMILAR_LISTINGS_LIMIT,
): Listing[] {
  const seen = new Set<string>([current.id]);
  const unique: Listing[] = [];
  for (const row of candidates) {
    if (!row?.id || seen.has(row.id)) continue;
    if (current.country && row.country && row.country !== current.country) continue;
    seen.add(row.id);
    unique.push(row);
  }
  const place = placeKey(current);
  const ordered = place
    ? [
        ...unique.filter((row) => placeKey(row) === place),
        ...unique.filter((row) => placeKey(row) !== place),
      ]
    : unique;
  return ordered.slice(0, limit);
}

/**
 * Similar listings for the detail screen. Widens the category until the grid is
 * full; any failure just ends the search (the section hides when empty).
 */
export async function fetchSimilarListings(
  listing: SimilarSource,
  accessToken?: string | null,
  limit = SIMILAR_LISTINGS_LIMIT,
): Promise<Listing[]> {
  const collected: Listing[] = [];
  for (const params of similarListingsQueries(listing)) {
    try {
      const page = await searchListingsPage(params, accessToken);
      collected.push(...page.listings);
    } catch {
      break;
    }
    if (pickSimilarListings(listing, collected, limit).length >= limit) break;
  }
  return pickSimilarListings(listing, collected, limit);
}

/** Split into rows of `columns`; the last row is padded with nulls so tiles keep their width. */
export function chunkIntoRows<T>(items: T[], columns = SIMILAR_LISTINGS_COLUMNS): Array<Array<T | null>> {
  const rows: Array<Array<T | null>> = [];
  for (let i = 0; i < items.length; i += columns) {
    const row: Array<T | null> = items.slice(i, i + columns);
    while (row.length < columns) row.push(null);
    rows.push(row);
  }
  return rows;
}
