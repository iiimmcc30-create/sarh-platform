import { SaudiCitiesService } from '../../geo/saudi-cities.service';
import { ListingsService } from '../listings.service';
import { ListingPromotionService } from '../promotion/listing-promotion.service';
import { interleavePromotedListings } from '../promotion/promotion-ranking.util';
import {
  isFeaturedActive,
  isPinnedActive,
  rankByEffectiveBoost,
  withEffectiveBoostState,
} from './boost-effective-state';
import { expireStaleBoostFlags } from './boost-expiry';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const past = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const future = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

type BoostRow = {
  boostType: 'featured' | 'pinned' | 'both';
  status: string;
  expiresAt: Date | null;
};
type ListingRow = {
  id: string;
  featured: boolean;
  featuredUntil: Date | null;
  pinned: boolean;
  pinnedUntil: Date | null;
  promoted: boolean;
  promotedUntil: Date | null;
  boosts: BoostRow[];
};

function listing(id: string, extras: Partial<ListingRow> = {}): ListingRow {
  return {
    id,
    featured: false,
    featuredUntil: null,
    pinned: false,
    pinnedUntil: null,
    promoted: false,
    promotedUntil: null,
    boosts: [],
    ...extras,
  };
}

/* ---------- tiny in-memory evaluator for the Prisma shapes the cleanup uses ---------- */

type Where = Record<string, any>;

function matchBoost(boost: BoostRow, where: Where): boolean {
  if (where.status !== undefined && boost.status !== where.status) return false;
  if (where.expiresAt?.gt !== undefined) {
    if (
      !boost.expiresAt ||
      boost.expiresAt.getTime() <= where.expiresAt.gt.getTime()
    ) {
      return false;
    }
  }
  if (where.boostType?.in && !where.boostType.in.includes(boost.boostType)) {
    return false;
  }
  return true;
}

function matchUntil(value: Date | null, cond: Where): boolean {
  if (cond.lte !== undefined) {
    return value !== null && value.getTime() <= cond.lte.getTime();
  }
  throw new Error('unsupported until filter');
}

function matchListing(row: ListingRow, where: Where): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(cond as Where[]).some((w) => matchListing(row, w))) return false;
    } else if (key === 'id') {
      if (
        typeof cond === 'string' ? row.id !== cond : !cond.in.includes(row.id)
      ) {
        return false;
      }
    } else if (key === 'featuredUntil' || key === 'pinnedUntil') {
      if (!matchUntil(row[key], cond as Where)) return false;
    } else if (key === 'boosts') {
      const rel = cond as { none?: Where; some?: Where };
      const { none, some } = rel;
      if (none && row.boosts.some((b) => matchBoost(b, none))) return false;
      if (some && !row.boosts.some((b) => matchBoost(b, some))) return false;
    } else {
      throw new Error('unsupported where key ' + key);
    }
  }
  return true;
}

function makeDb(rows: ListingRow[], afterFindMany?: () => void) {
  const listingDelegate = {
    findMany: jest.fn(
      async (args: { where: Where; select: Where; take: number }) => {
        const boostWhere = (args.select.boosts as { where: Where }).where;
        const out = rows
          .filter((row) => matchListing(row, args.where))
          .slice(0, args.take)
          .map((row) => ({
            id: row.id,
            featuredUntil: row.featuredUntil,
            pinnedUntil: row.pinnedUntil,
            boosts: row.boosts
              .filter((b) => matchBoost(b, boostWhere))
              .map((b) => ({ boostType: b.boostType, expiresAt: b.expiresAt })),
          }));
        afterFindMany?.();
        return out;
      },
    ),
    updateMany: jest.fn(
      async (args: { where: Where; data: Partial<ListingRow> }) => {
        let count = 0;
        for (const row of rows) {
          if (matchListing(row, args.where)) {
            Object.assign(row, args.data);
            count += 1;
          }
        }
        return { count };
      },
    ),
  };
  return { listing: listingDelegate };
}

/* ---------------------------------- effective state ---------------------------------- */

describe('effective Featured/Pinned state', () => {
  it('active Featured shows as featured; expired Featured does not', () => {
    const active = listing('a', { featured: true, featuredUntil: future(5) });
    const expired = listing('b', { featured: true, featuredUntil: past(1) });
    expect(isFeaturedActive(active, NOW)).toBe(true);
    expect(withEffectiveBoostState(active, NOW).featured).toBe(true);
    expect(isFeaturedActive(expired, NOW)).toBe(false);
    expect(withEffectiveBoostState(expired, NOW).featured).toBe(false);
    // Until is kept in the payload; contract fields unchanged.
    expect(withEffectiveBoostState(expired, NOW).featuredUntil).toEqual(
      past(1),
    );
  });

  it('active Pinned shows as pinned; expired Pinned does not', () => {
    const active = listing('a', { pinned: true, pinnedUntil: future(5) });
    const expired = listing('b', { pinned: true, pinnedUntil: past(1) });
    expect(isPinnedActive(active, NOW)).toBe(true);
    expect(withEffectiveBoostState(active, NOW).pinned).toBe(true);
    expect(isPinnedActive(expired, NOW)).toBe(false);
    expect(withEffectiveBoostState(expired, NOW).pinned).toBe(false);
  });

  it('expired Featured + active Pinned keeps only Pinned (and vice versa)', () => {
    const a = withEffectiveBoostState(
      listing('a', {
        featured: true,
        featuredUntil: past(1),
        pinned: true,
        pinnedUntil: future(60),
      }),
      NOW,
    );
    expect(a.featured).toBe(false);
    expect(a.pinned).toBe(true);

    const b = withEffectiveBoostState(
      listing('b', {
        featured: true,
        featuredUntil: future(60),
        pinned: true,
        pinnedUntil: past(1),
      }),
      NOW,
    );
    expect(b.featured).toBe(true);
    expect(b.pinned).toBe(false);
  });

  it('Until == now counts as expired; ISO strings from the cache are understood', () => {
    expect(isFeaturedActive({ featured: true, featuredUntil: NOW }, NOW)).toBe(
      false,
    );
    expect(
      isPinnedActive(
        { pinned: true, pinnedUntil: future(1).toISOString() },
        NOW,
      ),
    ).toBe(true);
    expect(
      isPinnedActive({ pinned: true, pinnedUntil: past(1).toISOString() }, NOW),
    ).toBe(false);
  });

  it('plan-granted flags without an Until stay active (no end date exists)', () => {
    expect(isFeaturedActive({ featured: true, featuredUntil: null }, NOW)).toBe(
      true,
    );
    expect(isPinnedActive({ pinned: true, pinnedUntil: null }, NOW)).toBe(true);
  });

  it('an active Promotion is unaffected by Featured/Pinned expiry', () => {
    const row = withEffectiveBoostState(
      listing('p', {
        featured: true,
        featuredUntil: past(1),
        pinned: true,
        pinnedUntil: past(1),
        promoted: true,
        promotedUntil: future(120),
      }),
      NOW,
    );
    expect(row.featured).toBe(false);
    expect(row.pinned).toBe(false);
    expect(row.promoted).toBe(true);
    expect(row.promotedUntil).toEqual(future(120));
  });
});

/* ------------------------------------- ranking -------------------------------------- */

describe('ranking uses effective flags: Pinned, then Featured, then the rest', () => {
  const rows = () => [
    listing('regular-new', {}),
    listing('featured-expired', { featured: true, featuredUntil: past(10) }),
    listing('pinned-expired', { pinned: true, pinnedUntil: past(10) }),
    listing('featured-active', { featured: true, featuredUntil: future(10) }),
    listing('pinned-active', { pinned: true, pinnedUntil: future(10) }),
  ];

  it('rankByEffectiveBoost keeps DB order inside each group', () => {
    const ranked = rankByEffectiveBoost(rows(), NOW);
    expect(ranked.map((r) => r.id)).toEqual([
      'pinned-active',
      'featured-active',
      'regular-new',
      'featured-expired',
      'pinned-expired',
    ]);
    expect(ranked.find((r) => r.id === 'pinned-expired')?.pinned).toBe(false);
    expect(ranked.find((r) => r.id === 'featured-expired')?.featured).toBe(
      false,
    );
  });

  it('interleavePromotedListings no longer keeps expired pinned/featured on top', () => {
    jest.useFakeTimers().setSystemTime(NOW);
    try {
      const created = (m: number) => ({ createdAt: past(m) });
      const ranked = interleavePromotedListings([
        { ...listing('regular-new'), ...created(1) },
        {
          ...listing('pinned-expired', { pinned: true, pinnedUntil: past(5) }),
          ...created(50),
        },
        {
          ...listing('featured-expired', {
            featured: true,
            featuredUntil: past(5),
          }),
          ...created(40),
        },
        {
          ...listing('featured-active', {
            featured: true,
            featuredUntil: future(5),
          }),
          ...created(30),
        },
        {
          ...listing('pinned-active', { pinned: true, pinnedUntil: future(5) }),
          ...created(20),
        },
      ]);
      expect(ranked.map((r) => r.id)).toEqual([
        'pinned-active',
        'featured-active',
        'regular-new',
        'featured-expired',
        'pinned-expired',
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('ListingsService.list returns effective flags and ranks by them', async () => {
    jest.useFakeTimers().setSystemTime(NOW);
    try {
      const base = {
        images: [],
        promotionWeight: 0,
        seller: { id: 's1', verified: false },
      };
      const repo = {
        findMany: jest.fn().mockResolvedValue([
          {
            ...listing('pinned-expired', {
              pinned: true,
              pinnedUntil: past(5),
            }),
            ...base,
            createdAt: past(1),
          },
          {
            ...listing('featured-expired', {
              featured: true,
              featuredUntil: past(5),
            }),
            ...base,
            createdAt: past(2),
          },
          {
            ...listing('pinned-active', {
              pinned: true,
              pinnedUntil: future(5),
            }),
            ...base,
            createdAt: past(30),
          },
          {
            ...listing('featured-active', {
              featured: true,
              featuredUntil: future(5),
            }),
            ...base,
            createdAt: past(40),
          },
          { ...listing('regular', {}), ...base, createdAt: past(3) },
        ]),
      };
      const service = new ListingsService(
        repo as never,
        {
          findBlockedRelationshipIds: jest.fn().mockResolvedValue([]),
        } as never,
        { get: jest.fn().mockResolvedValue(null), set: jest.fn() } as never,
        { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as never,
        {} as never,
        {} as never,
        {} as never,
        { resolveSync: jest.fn().mockReturnValue(null) } as never,
        {} as never,
        {
          expireStalePromotions: jest.fn().mockResolvedValue(undefined),
        } as never,
        {} as never,
        {} as never,
        new SaudiCitiesService({} as never),
      );

      const page = await service.list({} as never);
      const ids = page.listings.map((l) => (l as { id: string }).id);
      expect(ids.slice(0, 2)).toEqual(['pinned-active', 'featured-active']);
      const byId = new Map(
        page.listings.map((l) => [(l as { id: string }).id, l as ListingRow]),
      );
      expect(byId.get('pinned-expired')?.pinned).toBe(false);
      expect(byId.get('featured-expired')?.featured).toBe(false);
      expect(byId.get('pinned-active')?.pinned).toBe(true);
      expect(byId.get('featured-active')?.featured).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

/* ------------------------------------- cleanup -------------------------------------- */

describe('expireStaleBoostFlags (race-safe conditional cleanup)', () => {
  it('clears expired Featured but leaves an active Pinned untouched', async () => {
    const rows = [
      listing('l1', {
        featured: true,
        featuredUntil: past(1),
        pinned: true,
        pinnedUntil: future(60),
        boosts: [
          { boostType: 'featured', status: 'paid', expiresAt: past(1) },
          { boostType: 'pinned', status: 'paid', expiresAt: future(60) },
        ],
      }),
    ];
    const result = await expireStaleBoostFlags(makeDb(rows) as never, NOW);
    expect(rows[0]).toMatchObject({
      featured: false,
      featuredUntil: null,
      pinned: true,
      pinnedUntil: future(60),
    });
    expect(result).toMatchObject({ featuredCleared: 1, pinnedCleared: 0 });
    expect(result.changedListingIds).toEqual(['l1']);
  });

  it('clears expired Pinned but leaves an active Featured untouched', async () => {
    const rows = [
      listing('l1', {
        featured: true,
        featuredUntil: future(60),
        pinned: true,
        pinnedUntil: past(1),
      }),
    ];
    await expireStaleBoostFlags(makeDb(rows) as never, NOW);
    expect(rows[0]).toMatchObject({
      featured: true,
      featuredUntil: future(60),
      pinned: false,
      pinnedUntil: null,
    });
  });

  it("a 'both' boost expires Featured and Pinned by the same expiresAt", async () => {
    const expiresAt = past(1);
    const rows = [
      listing('l1', {
        featured: true,
        featuredUntil: expiresAt,
        pinned: true,
        pinnedUntil: expiresAt,
        boosts: [{ boostType: 'both', status: 'paid', expiresAt }],
      }),
    ];
    const result = await expireStaleBoostFlags(makeDb(rows) as never, NOW);
    expect(rows[0]).toMatchObject({
      featured: false,
      featuredUntil: null,
      pinned: false,
      pinnedUntil: null,
    });
    expect(result).toMatchObject({ featuredCleared: 1, pinnedCleared: 1 });
  });

  it('never touches promoted / promotedUntil', async () => {
    const rows = [
      listing('l1', {
        featured: true,
        featuredUntil: past(1),
        promoted: true,
        promotedUntil: future(300),
      }),
    ];
    const db = makeDb(rows);
    await expireStaleBoostFlags(db as never, NOW);
    expect(rows[0]).toMatchObject({
      promoted: true,
      promotedUntil: future(300),
    });
    for (const call of db.listing.updateMany.mock.calls) {
      expect(Object.keys(call[0].data)).not.toEqual(
        expect.arrayContaining(['promoted']),
      );
      expect(call[0].data).not.toHaveProperty('promotedUntil');
      expect(call[0].data).not.toHaveProperty('promotionWeight');
    }
  });

  it('does not clear a type still covered by another active paid boost; moves Until to it', async () => {
    const rows = [
      listing('l1', {
        featured: true,
        featuredUntil: past(1),
        pinned: true,
        pinnedUntil: past(1),
        boosts: [
          { boostType: 'featured', status: 'paid', expiresAt: past(1) },
          { boostType: 'both', status: 'paid', expiresAt: future(90) },
          { boostType: 'featured', status: 'pending', expiresAt: future(500) },
        ],
      }),
    ];
    const result = await expireStaleBoostFlags(makeDb(rows) as never, NOW);
    expect(rows[0]).toMatchObject({
      featured: true,
      featuredUntil: future(90),
      pinned: true,
      pinnedUntil: future(90),
    });
    expect(result).toMatchObject({
      featuredCleared: 0,
      pinnedCleared: 0,
      featuredExtended: 1,
      pinnedExtended: 1,
    });
  });

  it('does not clear a boost re-purchased concurrently (DB-evaluated condition)', async () => {
    const rows = [
      listing('l1', {
        featured: true,
        featuredUntil: past(1),
        boosts: [{ boostType: 'featured', status: 'paid', expiresAt: past(1) }],
      }),
    ];
    // Between the candidate read and the write, a new featured boost is fulfilled.
    const db = makeDb(rows, () => {
      rows[0].featured = true;
      rows[0].featuredUntil = future(24 * 60);
      rows[0].boosts.push({
        boostType: 'featured',
        status: 'paid',
        expiresAt: future(24 * 60),
      });
    });
    const result = await expireStaleBoostFlags(db as never, NOW);
    expect(rows[0]).toMatchObject({
      featured: true,
      featuredUntil: future(24 * 60),
    });
    expect(result.featuredCleared).toBe(0);
    expect(result.changedListingIds).toEqual([]);
    // The write itself carried the guards.
    expect(db.listing.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['l1'] },
          featuredUntil: { lte: NOW },
          boosts: {
            none: {
              status: 'paid',
              expiresAt: { gt: NOW },
              boostType: { in: ['featured', 'both'] },
            },
          },
        }),
        data: { featured: false, featuredUntil: null },
      }),
    );
  });

  it('does nothing when no Until has passed', async () => {
    const rows = [
      listing('l1', { featured: true, featuredUntil: future(1) }),
      listing('l2', { pinned: true, pinnedUntil: null }),
    ];
    const db = makeDb(rows);
    const result = await expireStaleBoostFlags(db as never, NOW);
    expect(db.listing.updateMany).not.toHaveBeenCalled();
    expect(result.changedListingIds).toEqual([]);
    expect(rows[1].pinned).toBe(true);
  });
});

describe('ListingPromotionService runs the boost expiry in the existing expiry pass', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function makeService(rows: ListingRow[]) {
    const db = makeDb(rows);
    const prisma = {
      ...db,
      listingPromotion: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const cache = {
      del: jest.fn().mockResolvedValue(undefined),
      delPattern: jest.fn().mockResolvedValue(0),
    };
    const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
    const service = new ListingPromotionService(
      prisma as never,
      logger as never,
      {} as never,
      cache as never,
      {} as never,
      {} as never,
    );
    return { service, cache, logger, prisma };
  }

  it('clears expired flags and invalidates the listings feed (v3) + listing caches', async () => {
    const rows = [listing('l1', { pinned: true, pinnedUntil: past(1) })];
    const { service, cache } = makeService(rows);

    await service.expireStalePromotions();

    expect(rows[0]).toMatchObject({ pinned: false, pinnedUntil: null });
    expect(cache.delPattern).toHaveBeenCalledWith('listings:v3:*');
    expect(cache.del).toHaveBeenCalledWith('listing:l1');
  });

  it('does not invalidate caches when nothing expired', async () => {
    const rows = [listing('l1', { pinned: true, pinnedUntil: future(10) })];
    const { service, cache } = makeService(rows);

    await service.expireStalePromotions();

    expect(cache.delPattern).not.toHaveBeenCalled();
    expect(rows[0].pinned).toBe(true);
  });

  it('a boost-expiry failure never breaks promotion expiry', async () => {
    const { service, prisma, logger } = makeService([]);
    prisma.listing.findMany.mockRejectedValueOnce(new Error('db down'));

    await expect(service.expireStalePromotions()).resolves.toBeUndefined();
    expect(prisma.listingPromotion.findMany).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('plan promotion treats an expired paid boost as not featured/pinned', () => {
  function makeListingsService(owner: Record<string, unknown>) {
    const repo = {
      findOwnerMeta: jest.fn().mockResolvedValue(owner),
      applyPlanPromotion: jest.fn().mockResolvedValue({ id: 'l1', images: [] }),
    };
    const entitlements = {
      assertCanApplyListingPromotion: jest.fn().mockResolvedValue(undefined),
    };
    const paidServices = {
      getFlags: jest
        .fn()
        .mockResolvedValue({ featureEnabled: true, pinEnabled: true }),
    };
    const service = new ListingsService(
      repo as never,
      {} as never,
      { del: jest.fn(), delPattern: jest.fn() } as never,
      { info: jest.fn(), error: jest.fn(), warn: jest.fn() } as never,
      {} as never,
      {} as never,
      entitlements as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      paidServices as never,
      new SaudiCitiesService({} as never),
    );
    return { service, repo };
  }
  const user = { userId: 'u1', username: 'u', role: 'USER' };
  const owner = { sellerId: 'u1', origin: 'USER' };

  it('allows plan Featured when the paid Featured already expired', async () => {
    const { service, repo } = makeListingsService({
      ...owner,
      featured: true,
      featuredUntil: new Date(Date.now() - 60_000),
      pinned: false,
      pinnedUntil: null,
    });
    await service.applyPlanPromotion(user as never, 'l1', {
      featured: true,
    } as never);
    expect(repo.applyPlanPromotion).toHaveBeenCalledWith(
      expect.objectContaining({ setFeatured: true, setPinned: false }),
    );
  });

  it('still refuses when the paid Featured is active', async () => {
    const { service, repo } = makeListingsService({
      ...owner,
      featured: true,
      featuredUntil: new Date(Date.now() + 60 * 60_000),
      pinned: false,
      pinnedUntil: null,
    });
    await expect(
      service.applyPlanPromotion(user as never, 'l1', {
        featured: true,
      } as never),
    ).rejects.toMatchObject({ error: 'already_promoted' });
    expect(repo.applyPlanPromotion).not.toHaveBeenCalled();
  });
});
