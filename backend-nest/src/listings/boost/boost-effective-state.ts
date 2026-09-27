/**
 * Effective Featured/Pinned state for a listing.
 *
 * A paid boost writes `featured=true` + `featuredUntil` (or `pinned=true` +
 * `pinnedUntil`). The boolean alone is not trusted: the flag only counts while
 * its Until is still in the future. A null Until means the flag was granted
 * without an end date (subscription plan quota at create / plan promote), which
 * has never had an expiry, so it stays active.
 *
 * Dependency-free on purpose so ranking utils, services and repositories can
 * share it without import cycles.
 */
export interface BoostFlagFields {
  featured?: boolean | null;
  featuredUntil?: Date | string | null;
  pinned?: boolean | null;
  pinnedUntil?: Date | string | null;
}

function untilStillActive(
  until: Date | string | null | undefined,
  nowMs: number,
): boolean {
  if (until === null || until === undefined) return true;
  const ms =
    until instanceof Date ? until.getTime() : new Date(until).getTime();
  return Number.isFinite(ms) && ms > nowMs;
}

export function isFeaturedActive(
  listing: BoostFlagFields,
  now: Date = new Date(),
): boolean {
  return (
    listing.featured === true &&
    untilStillActive(listing.featuredUntil, now.getTime())
  );
}

export function isPinnedActive(
  listing: BoostFlagFields,
  now: Date = new Date(),
): boolean {
  return (
    listing.pinned === true &&
    untilStillActive(listing.pinnedUntil, now.getTime())
  );
}

/**
 * Same object with `featured` / `pinned` replaced by their effective values
 * (false once expired). Field names and the rest of the payload are unchanged.
 */
export function withEffectiveBoostState<T extends BoostFlagFields>(
  listing: T,
  now: Date = new Date(),
): T {
  const featuredExpired =
    listing.featured === true && !isFeaturedActive(listing, now);
  const pinnedExpired =
    listing.pinned === true && !isPinnedActive(listing, now);
  if (!featuredExpired && !pinnedExpired) return listing;
  return {
    ...listing,
    ...(featuredExpired ? { featured: false } : {}),
    ...(pinnedExpired ? { pinned: false } : {}),
  };
}

/** Pinned first, then Featured, then the rest (0 keeps the existing order). */
export function compareEffectiveBoost(
  a: BoostFlagFields,
  b: BoostFlagFields,
  now: Date = new Date(),
): number {
  const pinnedDiff =
    Number(isPinnedActive(b, now)) - Number(isPinnedActive(a, now));
  if (pinnedDiff !== 0) return pinnedDiff;
  return Number(isFeaturedActive(b, now)) - Number(isFeaturedActive(a, now));
}

/**
 * Apply effective flags and stable-sort Pinned > Featured > rest, preserving
 * the incoming (database) order inside each group.
 */
export function rankByEffectiveBoost<T extends BoostFlagFields>(
  rows: T[],
  now: Date = new Date(),
): T[] {
  return rows
    .map((row) => withEffectiveBoostState(row, now))
    .sort((a, b) => compareEffectiveBoost(a, b, now));
}
