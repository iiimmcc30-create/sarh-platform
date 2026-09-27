/**
 * Paid Featured / Pinned / Promoted end-time math (pure).
 *
 * A purchase while the same type is still active extends from the current end:
 *   newUntil = max(now, currentUntil) + duration
 * A null (e.g. plan featuring without an Until), invalid or past currentUntil
 * starts from now. Used by every fulfilment path (payment webhook / return URL
 * via PaymentsRepository.processSuccessfulPayment, and the boost / promotion
 * services) so they all compute the same date.
 */
export const HOUR_MS = 60 * 60 * 1000;

export function extendUntil(
  currentUntil: Date | string | null | undefined,
  now: Date,
  durationMs: number,
): Date {
  const current =
    currentUntil == null ? Number.NaN : new Date(currentUntil).getTime();
  const nowMs = now.getTime();
  const base = Number.isFinite(current) && current > nowMs ? current : nowMs;
  return new Date(base + Math.max(0, durationMs));
}

export type BoostUntilFields = {
  featuredUntil?: Date | null;
  pinnedUntil?: Date | null;
};

export type BoostListingData =
  | { featured: true; featuredUntil: Date }
  | { pinned: true; pinnedUntil: Date }
  | { featured: true; featuredUntil: Date; pinned: true; pinnedUntil: Date };

/**
 * Listing update + boost expiresAt for a paid boost. Each type extends its own
 * Until (featured -> featuredUntil, pinned -> pinnedUntil). For 'both' the boost
 * row's expiresAt is the later of the two ends.
 */
export function extendBoostUntil(
  boostType: string,
  current: BoostUntilFields | null | undefined,
  now: Date,
  durationMs: number,
): { expiresAt: Date; listingData: BoostListingData } {
  if (boostType === 'featured') {
    const featuredUntil = extendUntil(current?.featuredUntil, now, durationMs);
    return {
      expiresAt: featuredUntil,
      listingData: { featured: true, featuredUntil },
    };
  }
  if (boostType === 'pinned') {
    const pinnedUntil = extendUntil(current?.pinnedUntil, now, durationMs);
    return {
      expiresAt: pinnedUntil,
      listingData: { pinned: true, pinnedUntil },
    };
  }
  const featuredUntil = extendUntil(current?.featuredUntil, now, durationMs);
  const pinnedUntil = extendUntil(current?.pinnedUntil, now, durationMs);
  return {
    expiresAt:
      featuredUntil.getTime() >= pinnedUntil.getTime()
        ? featuredUntil
        : pinnedUntil,
    listingData: { featured: true, featuredUntil, pinned: true, pinnedUntil },
  };
}
