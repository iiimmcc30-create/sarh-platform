/**
 * «بائع ذهبي» — a seller with the public Gold badge (`verified` + `verifiedTier: 'gold'`;
 * the backend sets the tier only while Gold is active and approved). Pure, no RN imports.
 */
import { isListingPinnedActive, type ListingBoostFields } from '@/lib/listingBoostState';

export const GOLD_SELLER_LABEL = 'بائع ذهبي';

type SellerFields =
  | {
      verified?: boolean | null;
      verifiedTier?: string | null;
      /** Set by the API when a Gold seller hid «بائع ذهبي» («التوثيق» hub). */
      hideGoldSellerLabel?: boolean | null;
    }
  | null
  | undefined;

export function isGoldSeller(user: SellerFields): boolean {
  return Boolean(user && user.verified === true && user.verifiedTier === 'gold');
}

/** «بائع ذهبي» label: a Gold seller who did not hide it (ranking ignores this). */
export function showsGoldSellerLabel(user: SellerFields): boolean {
  return isGoldSeller(user) && user?.hideGoldSellerLabel !== true;
}

/**
 * Inside a picked region, Gold sellers' listings lead the feed. Paid pins keep the very
 * top (they were bought for that spot); everything else keeps its order (stable).
 */
export function goldSellersFirstInRegion<T extends ListingBoostFields & { seller?: SellerFields }>(
  list: readonly T[],
): T[] {
  const pinned: T[] = [];
  const gold: T[] = [];
  const rest: T[] = [];
  for (const item of list) {
    if (isListingPinnedActive(item)) pinned.push(item);
    else if (isGoldSeller(item.seller)) gold.push(item);
    else rest.push(item);
  }
  return gold.length ? [...pinned, ...gold, ...rest] : [...list];
}
