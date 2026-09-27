/**
 * Effective Featured / Pinned / Promoted for a listing held on the device.
 *
 * The API already sends effective flags, but listings live on in memory, in
 * the bootstrap page and in the disk feed snapshot (up to 6h) and would keep
 * an expired boost until the next refetch. So every render/sort re-checks the
 * flag against its Until, with the same rule as the backend
 * (boost-effective-state.ts): the flag counts only while its Until is in the
 * future; no Until (plan-granted) means no end date, so it stays active.
 */
export type ListingBoostFields = {
  featured?: boolean | null;
  featuredUntil?: string | null;
  pinned?: boolean | null;
  pinnedUntil?: string | null;
  promoted?: boolean | null;
  promotedUntil?: string | null;
  promotionWeight?: number | null;
};

function untilStillActive(until: string | null | undefined, nowMs: number): boolean {
  if (until === null || until === undefined || until === '') return true;
  const ms = Date.parse(until);
  return Number.isFinite(ms) && ms > nowMs;
}

export function isListingFeaturedActive(listing: ListingBoostFields, now: number = Date.now()): boolean {
  return listing.featured === true && untilStillActive(listing.featuredUntil, now);
}

export function isListingPinnedActive(listing: ListingBoostFields, now: number = Date.now()): boolean {
  return listing.pinned === true && untilStillActive(listing.pinnedUntil, now);
}

export function isListingPromotedActive(listing: ListingBoostFields, now: number = Date.now()): boolean {
  return listing.promoted === true && untilStillActive(listing.promotedUntil, now);
}

/** promotionWeight only counts while the Promotion itself is still active. */
export function effectiveListingPromotionWeight(
  listing: ListingBoostFields,
  now: number = Date.now(),
): number {
  if (listing.promoted === true && !isListingPromotedActive(listing, now)) return 0;
  return listing.promotionWeight ?? 0;
}