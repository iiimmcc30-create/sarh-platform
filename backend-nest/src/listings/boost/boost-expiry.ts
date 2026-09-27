import type { BoostType, Prisma, PrismaClient } from '@prisma/client';

/**
 * Expire paid Featured/Pinned flags whose Until has passed.
 *
 * - featuredUntil <= now  -> featured=false, featuredUntil=null
 * - pinnedUntil   <= now  -> pinned=false,   pinnedUntil=null
 * - each type is handled independently (one expiring never touches the other)
 * - if another paid boost covering the same type (incl. 'both') is still
 *   active, the Until is moved to that boost's expiresAt instead of clearing
 *   (the Until mirrors the paid boost's expiresAt, same as fulfilment writes)
 * - promoted / promotedUntil are never touched (Promotion is independent)
 *
 * Every write is a conditional updateMany evaluated by the database
 * (`<type>Until <= now`), so a concurrent re-purchase that has already moved
 * the Until into the future is never cleared or shortened.
 */
export type BoostKind = 'featured' | 'pinned';

export const BOOST_EXPIRY_BATCH = 500;

const COVERING_TYPES: Record<BoostKind, BoostType[]> = {
  featured: ['featured', 'both'],
  pinned: ['pinned', 'both'],
};

export interface BoostExpiryResult {
  featuredCleared: number;
  pinnedCleared: number;
  featuredExtended: number;
  pinnedExtended: number;
  changedListingIds: string[];
}

type BoostExpiryDb = Pick<PrismaClient, 'listing'>;

function activeCoveringBoost(
  kind: BoostKind,
  now: Date,
): Prisma.ListingBoostWhereInput {
  return {
    status: 'paid',
    expiresAt: { gt: now },
    boostType: { in: COVERING_TYPES[kind] },
  };
}

function untilExpired(kind: BoostKind, now: Date): Prisma.ListingWhereInput {
  return kind === 'featured'
    ? { featuredUntil: { lte: now } }
    : { pinnedUntil: { lte: now } };
}

function clearData(kind: BoostKind): Prisma.ListingUpdateManyMutationInput {
  return kind === 'featured'
    ? { featured: false, featuredUntil: null }
    : { pinned: false, pinnedUntil: null };
}

function extendData(
  kind: BoostKind,
  until: Date,
): Prisma.ListingUpdateManyMutationInput {
  return kind === 'featured'
    ? { featured: true, featuredUntil: until }
    : { pinned: true, pinnedUntil: until };
}

export async function expireStaleBoostFlags(
  db: BoostExpiryDb,
  now: Date = new Date(),
): Promise<BoostExpiryResult> {
  const result: BoostExpiryResult = {
    featuredCleared: 0,
    pinnedCleared: 0,
    featuredExtended: 0,
    pinnedExtended: 0,
    changedListingIds: [],
  };

  const candidates = await db.listing.findMany({
    where: {
      OR: [untilExpired('featured', now), untilExpired('pinned', now)],
    },
    select: {
      id: true,
      featuredUntil: true,
      pinnedUntil: true,
      boosts: {
        where: { status: 'paid', expiresAt: { gt: now } },
        select: { boostType: true, expiresAt: true },
      },
    },
    take: BOOST_EXPIRY_BATCH,
  });
  if (candidates.length === 0) return result;

  const changed = new Set<string>();
  const nowMs = now.getTime();

  for (const kind of ['featured', 'pinned'] as const) {
    const clearIds: string[] = [];
    const extend: Array<{ id: string; until: Date }> = [];

    for (const row of candidates) {
      const until = kind === 'featured' ? row.featuredUntil : row.pinnedUntil;
      if (!until || until.getTime() > nowMs) continue;
      const coveringExpiries = row.boosts
        .filter(
          (boost) =>
            COVERING_TYPES[kind].includes(boost.boostType) &&
            boost.expiresAt !== null &&
            boost.expiresAt.getTime() > nowMs,
        )
        .map((boost) => (boost.expiresAt as Date).getTime());
      if (coveringExpiries.length === 0) {
        clearIds.push(row.id);
      } else {
        extend.push({
          id: row.id,
          until: new Date(Math.max(...coveringExpiries)),
        });
      }
    }

    if (clearIds.length > 0) {
      const { count } = await db.listing.updateMany({
        where: {
          id: { in: clearIds },
          ...untilExpired(kind, now),
          boosts: { none: activeCoveringBoost(kind, now) },
        },
        data: clearData(kind),
      });
      if (kind === 'featured') result.featuredCleared += count;
      else result.pinnedCleared += count;
      if (count > 0) clearIds.forEach((id) => changed.add(id));
    }

    for (const item of extend) {
      const { count } = await db.listing.updateMany({
        where: { id: item.id, ...untilExpired(kind, now) },
        data: extendData(kind, item.until),
      });
      if (kind === 'featured') result.featuredExtended += count;
      else result.pinnedExtended += count;
      if (count > 0) changed.add(item.id);
    }
  }

  result.changedListingIds = [...changed];
  return result;
}
