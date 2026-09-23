type RankableListing = {
  id: string;
  pinned?: boolean;
  featured?: boolean;
  promoted?: boolean;
  promotionWeight?: number;
  createdAt?: Date | string;
};

function byRecency(a: RankableListing, b: RankableListing): number {
  const ta = new Date(a.createdAt ?? 0).getTime();
  const tb = new Date(b.createdAt ?? 0).getTime();
  return tb - ta;
}

function byFeaturedThenWeight(a: RankableListing, b: RankableListing): number {
  const featuredDiff = Number(b.featured) - Number(a.featured);
  if (featuredDiff !== 0) return featuredDiff;
  const weightDiff = (b.promotionWeight ?? 0) - (a.promotionWeight ?? 0);
  if (weightDiff !== 0) return weightDiff;
  return byRecency(a, b);
}

/**
 * Interleave promoted listings every 6–8 regular items without hoarding top slots.
 * Pinned listings always stay at the top.
 */
export function interleavePromotedListings<T extends RankableListing>(
  listings: T[],
  intervalMin = 6,
  intervalMax = 8,
): T[] {
  if (listings.length <= 1) return listings;

  const pinned = listings.filter((l) => l.pinned).sort(byFeaturedThenWeight);
  const rest = listings.filter((l) => !l.pinned);

  const promotedPool = rest
    .filter((l) => l.promoted)
    .sort(byFeaturedThenWeight);
  const regularPool = rest
    .filter((l) => !l.promoted)
    .sort(byFeaturedThenWeight);

  if (promotedPool.length === 0) {
    return [...pinned, ...regularPool];
  }

  const merged: T[] = [...pinned];
  let promoIdx = 0;
  let regularIdx = 0;
  let sinceLastPromo = intervalMax;
  let nextSlot =
    intervalMin + Math.floor(Math.random() * (intervalMax - intervalMin + 1));

  while (regularIdx < regularPool.length || promoIdx < promotedPool.length) {
    const shouldInsertPromo =
      promoIdx < promotedPool.length &&
      (sinceLastPromo >= nextSlot || regularIdx >= regularPool.length);

    if (shouldInsertPromo) {
      merged.push(promotedPool[promoIdx++]);
      sinceLastPromo = 0;
      nextSlot =
        intervalMin +
        Math.floor(Math.random() * (intervalMax - intervalMin + 1));
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

/** Search ranking boost from promotion weight (does not override pin/feature). */
export function promotionSearchScore(
  weight: number | undefined | null,
): number {
  if (!weight || weight <= 0) return 0;
  return Math.min(weight / 100, 3);
}
