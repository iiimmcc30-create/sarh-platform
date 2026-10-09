import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { ProfileViewsService } from '../../users/services/profile-views.service';
import {
  FREE_BOOST_TX_PREFIX,
  ListingFreeBoostService,
} from '../../listings/boost/listing-free-boost.service';

/**
 * Real-database checks for «مين شاف ملفي» and the weekly free boosts.
 *   COUNCILS_TEST_DATABASE_URL=postgresql://... npx jest subscriber-perks.db
 */
const DB_URL =
  process.env.PERKS_TEST_DATABASE_URL ?? process.env.COUNCILS_TEST_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

type ApiErr = { status: number; error: string };
async function apiError(fn: () => Promise<unknown>): Promise<ApiErr> {
  try {
    await fn();
  } catch (err) {
    return err as ApiErr;
  }
  throw new Error('expected an ApiException');
}

suite('subscriber perks (real Postgres)', () => {
  let prisma: PrismaClient;
  const tag = `v${Date.now().toString(36)}`;
  const users: Record<string, string> = {};
  const slugs: Record<string, string> = {};
  const jwt = (name: string, role = 'USER') =>
    ({ userId: users[name], username: name, role }) as unknown as JwtPayload;
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const cache = {
    claimOnce: jest.fn().mockResolvedValue(true),
    delPattern: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
  };
  const entitlements = {
    getEffectivePlanSlugForUser: jest.fn(
      async (id: string) => slugs[id] ?? 'free',
    ),
    getEffectiveContextForUser: jest.fn(async (id: string) => ({
      planSlug: slugs[id] ?? 'free',
      permissions: {},
    })),
  };
  let views: ProfileViewsService;
  let boosts: ListingFreeBoostService;

  async function makeUser(
    name: string,
    slug = 'free',
    extra: Record<string, unknown> = {},
  ) {
    const u = await prisma.user.create({
      data: {
        username: `${tag}_${name}`,
        passwordHash: 'x',
        displayName: name,
        arabicName: name,
        ...extra,
      },
    });
    users[name] = u.id;
    slugs[u.id] = slug;
  }

  async function makeListing(owner: string) {
    const l = await prisma.listing.create({
      data: {
        sellerId: users[owner],
        title: 'Camel',
        arabicTitle: 'ناقة',
        description: 'd',
        arabicDescription: 'd',
        price: 1000,
        category: 'camels',
        location: 'Riyadh',
        arabicLocation: 'الرياض',
        country: 'SA',
      },
    });
    return l.id;
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    const db = prisma as unknown as PrismaService;
    views = new ProfileViewsService(
      db,
      cache as never,
      entitlements as never,
      logger as never,
    );
    boosts = new ListingFreeBoostService(
      db,
      entitlements as never,
      {
        assertBoostTypeEnabled: jest.fn().mockResolvedValue(undefined),
      } as never,
      { notifyUser: jest.fn().mockResolvedValue(undefined) } as never,
      cache as never,
      logger as never,
    );
    await makeUser('owner');
    await makeUser('subscriber', 'blue-badge');
    await makeUser('a');
    await makeUser('b');
    await makeUser('hidden', 'free', { showInSearch: false });
    await makeUser('blocker');
    await makeUser('plus', 'blue-plus-badge');
    await makeUser('gold', 'gold-badge');
    await makeUser('blue', 'blue-badge');
    await prisma.userBlock.create({
      data: { blockerId: users.blocker, blockedId: users.owner },
    });
  });

  afterAll(async () => {
    const ids = Object.values(users);
    await prisma.listingBoost.deleteMany({ where: { userId: { in: ids } } });
    await prisma.listing.deleteMany({ where: { sellerId: { in: ids } } });
    await prisma.userBlock.deleteMany({ where: { blockerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('records one row per viewer per day, never self or staff', async () => {
    const day1 = new Date('2026-10-01T10:00:00Z');
    await views.record(users.owner, jwt('a'), day1);
    await views.record(users.owner, jwt('a'), new Date('2026-10-01T18:00:00Z'));
    await views.record(users.owner, jwt('owner'), day1);
    await views.record(users.owner, jwt('b', 'ADMIN'), day1);
    const rows = await prisma.profileView.findMany({
      where: { profileId: users.owner },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].viewedAt.toISOString()).toBe('2026-10-01T18:00:00.000Z');
  });

  it('lists 30 days for subscribers, count only (locked) for free accounts', async () => {
    const now = new Date('2026-10-08T12:00:00Z');
    await views.record(users.owner, jwt('b'), new Date('2026-10-07T09:00:00Z'));
    await views.record(
      users.owner,
      jwt('hidden'),
      new Date('2026-10-07T09:00:00Z'),
    );
    await views.record(
      users.owner,
      jwt('blocker'),
      new Date('2026-10-07T09:00:00Z'),
    );
    await views.record(users.owner, jwt('a'), new Date('2026-09-01T09:00:00Z')); // > 30 days
    await views.record(
      users.subscriber,
      jwt('a'),
      new Date('2026-10-06T09:00:00Z'),
    );
    await views.record(
      users.subscriber,
      jwt('b'),
      new Date('2026-10-07T09:00:00Z'),
    );
    await views.record(
      users.subscriber,
      jwt('a'),
      new Date('2026-10-08T09:00:00Z'),
    );

    const free = await views.listForOwner(users.owner, now);
    // a (Oct 1) + b; hidden accounts and blocked pairs are never counted/listed.
    expect(free).toMatchObject({ locked: true, total: 2, viewers: [] });

    const sub = await views.listForOwner(users.subscriber, now);
    expect(sub.locked).toBe(false);
    expect(sub.total).toBe(2);
    expect(
      (sub.viewers as Array<{ user: { id: string }; viewedAt: Date }>).map(
        (v) => [v.user.id, v.viewedAt.toISOString()],
      ),
    ).toEqual([
      [users.a, '2026-10-08T09:00:00.000Z'],
      [users.b, '2026-10-07T09:00:00.000Z'],
    ]);
  });

  it('free boosts: Blue none, Blue+ 2 per rolling week, featured 24h, no payment', async () => {
    const blueListing = await makeListing('blue');
    const plusListing = await makeListing('plus');
    const quotaBlue = await boosts.getQuota(jwt('blue'));
    expect(quotaBlue).toMatchObject({ eligible: false, remaining: 0 });
    const denied = await apiError(() =>
      boosts.applyFreeBoost(jwt('blue'), blueListing),
    );
    expect(denied).toMatchObject({ status: 403, error: 'plan_required' });

    await expect(boosts.getQuota(jwt('plus'))).resolves.toMatchObject({
      eligible: true,
      weeklyLimit: 2,
      remaining: 2,
    });
    const now = new Date();
    const first = await boosts.applyFreeBoost(jwt('plus'), plusListing, now);
    expect(first.remaining).toBe(1);
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: plusListing },
    });
    expect(listing.featured).toBe(true);
    expect(listing.featuredUntil!.getTime()).toBe(
      now.getTime() + 24 * 3600_000,
    );
    const row = await prisma.listingBoost.findUniqueOrThrow({
      where: { id: first.boostId },
    });
    expect(row).toMatchObject({
      amount: 0,
      status: 'paid',
      boostType: 'featured',
    });
    expect(row.transactionId).toBe(`${FREE_BOOST_TX_PREFIX}${first.boostId}`);
    expect(
      await prisma.payment.count({ where: { referenceId: first.boostId } }),
    ).toBe(0);

    // Second boost extends from the current end (same math as a paid boost).
    const second = await boosts.applyFreeBoost(jwt('plus'), plusListing, now);
    expect(second.remaining).toBe(0);
    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: plusListing },
    });
    expect(after.featuredUntil!.getTime()).toBe(now.getTime() + 48 * 3600_000);

    const over = await apiError(() =>
      boosts.applyFreeBoost(jwt('plus'), plusListing, now),
    );
    expect(over).toMatchObject({ status: 409, error: 'free_boost_quota' });

    // Someone else's listing is never boosted.
    const foreign = await apiError(() =>
      boosts.applyFreeBoost(jwt('gold'), plusListing),
    );
    expect(foreign).toMatchObject({ status: 404 });

    // Rolling window: 8 days later the slots are back.
    const later = new Date(now.getTime() + 8 * 24 * 3600_000);
    await expect(boosts.getQuota(jwt('plus'), later)).resolves.toMatchObject({
      remaining: 2,
    });
  });

  it('Gold gets 4 and concurrent taps never exceed the quota', async () => {
    const id = await makeListing('gold');
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => boosts.applyFreeBoost(jwt('gold'), id)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(4);
    await expect(boosts.getQuota(jwt('gold'))).resolves.toMatchObject({
      remaining: 0,
      used: 4,
    });
  });
});
