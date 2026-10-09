// Paid promotion stats (impressions / clicks) for the seller's «إحصائيات الترويج».
// Fire-and-forget; each listing counts one impression and one click per app session.
import type { Listing } from '@/services/types';
import { trackPromotionEvent } from '@/services/listingPromotion';

const impressed = new Set<string>();
const clicked = new Set<string>();

/** Listing has a live paid promotion (server flag + end time still ahead). */
export function isActivelyPromoted(
  listing: Pick<Listing, 'promoted' | 'promotedUntil'> | null | undefined,
  now = Date.now(),
): boolean {
  if (!listing?.promoted) return false;
  if (!listing.promotedUntil) return true;
  const until = Date.parse(listing.promotedUntil);
  return !Number.isFinite(until) || until > now;
}

/** Feed row became visible: one impression per promoted listing per session. */
export function trackPromotedImpression(listing: Listing | null | undefined): boolean {
  if (!listing?.id || !isActivelyPromoted(listing) || impressed.has(listing.id)) return false;
  impressed.add(listing.id);
  void trackPromotionEvent(listing.id, 'impression');
  return true;
}

/** Promoted listing opened from the feed: one click per listing per session. */
export function trackPromotedClick(listing: Listing | null | undefined): boolean {
  if (!listing?.id || !isActivelyPromoted(listing) || clicked.has(listing.id)) return false;
  clicked.add(listing.id);
  void trackPromotionEvent(listing.id, 'click');
  return true;
}

/** Feed viewability: ≥ 50% of the card on screen for ≥ 500ms. */
export const PROMOTION_VIEWABILITY = {
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 500,
} as const;

/** Test-only reset. */
export function resetPromotionTracking(): void {
  impressed.clear();
  clicked.clear();
}
