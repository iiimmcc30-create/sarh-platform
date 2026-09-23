import type { Listing } from '@/services/types';

export type MarketSortMode = 'newest' | 'oldest' | 'price_asc' | 'price_desc';

/** Client-side market chip cycle — newest → oldest → price ↑ → price ↓. */
export function nextMarketSortMode(mode: MarketSortMode): MarketSortMode {
  if (mode === 'newest') return 'oldest';
  if (mode === 'oldest') return 'price_asc';
  if (mode === 'price_asc') return 'price_desc';
  return 'newest';
}

function byRecency(a: Listing, b: Listing): number {
  const ta = new Date(a.createdAt ?? a.postedAt ?? 0).getTime();
  const tb = new Date(b.createdAt ?? b.postedAt ?? 0).getTime();
  return tb - ta;
}

function byFeaturedThenWeight(a: Listing, b: Listing): number {
  const featuredDiff = Number(b.featured) - Number(a.featured);
  if (featuredDiff !== 0) return featuredDiff;
  const weightDiff = (b.promotionWeight ?? 0) - (a.promotionWeight ?? 0);
  if (weightDiff !== 0) return weightDiff;
  return byRecency(a, b);
}

/** Pinned first, then featured, then subscriber priority, then promotion weight, then newest. */
export function compareListingBoostPriority(a: Listing, b: Listing): number {
  const pinnedDiff = Number(b.pinned) - Number(a.pinned);
  if (pinnedDiff !== 0) return pinnedDiff;
  const featuredDiff = Number(b.featured) - Number(a.featured);
  if (featuredDiff !== 0) return featuredDiff;
  const verifiedDiff = Number(b.seller?.verified) - Number(a.seller?.verified);
  if (verifiedDiff !== 0) return verifiedDiff;
  const weightDiff = (b.promotionWeight ?? 0) - (a.promotionWeight ?? 0);
  if (weightDiff !== 0) return weightDiff;
  return byRecency(a, b);
}

/** Client-side feed interleaving — mirrors backend promotion slots. */
export function interleavePromotedListings(listings: Listing[]): Listing[] {
  if (listings.length <= 1) return listings;

  const pinned = listings.filter((l) => l.pinned).sort(byFeaturedThenWeight);
  const rest = listings.filter((l) => !l.pinned);
  const promotedPool = rest.filter((l) => l.promoted).sort(byFeaturedThenWeight);
  const regularPool = rest.filter((l) => !l.promoted).sort(byFeaturedThenWeight);

  if (promotedPool.length === 0) return [...pinned, ...regularPool];

  const merged: Listing[] = [...pinned];
  let promoIdx = 0;
  let regularIdx = 0;
  let sinceLastPromo = 8;
  let nextSlot = 6 + Math.floor(Math.random() * 3);

  while (regularIdx < regularPool.length || promoIdx < promotedPool.length) {
    const shouldInsertPromo =
      promoIdx < promotedPool.length &&
      (sinceLastPromo >= nextSlot || regularIdx >= regularPool.length);

    if (shouldInsertPromo) {
      merged.push(promotedPool[promoIdx++]);
      sinceLastPromo = 0;
      nextSlot = 6 + Math.floor(Math.random() * 3);
      continue;
    }

    if (regularIdx < regularPool.length) {
      merged.push(regularPool[regularIdx++]);
      sinceLastPromo += 1;
      continue;
    }

    merged.push(promotedPool[promoIdx++]);
    sinceLastPromo = 0;
  }

  return merged;
}
