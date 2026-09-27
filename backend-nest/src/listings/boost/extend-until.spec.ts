import { HOUR_MS, extendBoostUntil, extendUntil } from './extend-until';
import { ListingBoostService } from './listing-boost.service';
import { ListingPromotionService } from '../promotion/listing-promotion.service';
import { PaymentsRepository } from '../../payments/repositories/payments.repository';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const DAY_MS = 24 * HOUR_MS;
const inDays = (days: number) => new Date(NOW.getTime() + days * DAY_MS);

describe('extendUntil (re-purchase end-time math)', () => {
  it('null / undefined currentUntil starts from now', () => {
    expect(extendUntil(null, NOW, 7 * DAY_MS)).toEqual(inDays(7));
    expect(extendUntil(undefined, NOW, 7 * DAY_MS)).toEqual(inDays(7));
  });

  it('past currentUntil starts from now', () => {
    expect(extendUntil(inDays(-3), NOW, 7 * DAY_MS)).toEqual(inDays(7));
  });

  it('currentUntil exactly now starts from now', () => {
    expect(extendUntil(NOW, NOW, 7 * DAY_MS)).toEqual(inDays(7));
  });

  it('future currentUntil extends from currentUntil (keeps remaining time)', () => {
    expect(extendUntil(inDays(3), NOW, 7 * DAY_MS)).toEqual(inDays(10));
  });

  it('accepts ISO strings and ignores invalid dates', () => {
    expect(extendUntil(inDays(2).toISOString(), NOW, DAY_MS)).toEqual(
      inDays(3),
    );
    expect(extendUntil('not-a-date', NOW, DAY_MS)).toEqual(inDays(1));
  });

  it('never returns a new Date sharing the input instance', () => {
    const current = inDays(1);
    const out = extendUntil(current, NOW, DAY_MS);
    expect(out).not.toBe(current);
    expect(current).toEqual(inDays(1));
  });
});

describe('extendBoostUntil (same field per type)', () => {
  it('featured extends featuredUntil only', () => {
    const r = extendBoostUntil(
      'featured',
      { featuredUntil: inDays(2), pinnedUntil: inDays(20) },
      NOW,
      7 * DAY_MS,
    );
    expect(r.listingData).toEqual({ featured: true, featuredUntil: inDays(9) });
    expect(r.expiresAt).toEqual(inDays(9));
  });

  it('pinned extends pinnedUntil only (featured Until is irrelevant)', () => {
    const r = extendBoostUntil(
      'pinned',
      { featuredUntil: inDays(20), pinnedUntil: null },
      NOW,
      DAY_MS,
    );
    expect(r.listingData).toEqual({ pinned: true, pinnedUntil: inDays(1) });
    expect(r.expiresAt).toEqual(inDays(1));
  });

  it('both extends each Until from its own current value', () => {
    const r = extendBoostUntil(
      'both',
      { featuredUntil: inDays(4), pinnedUntil: inDays(-1) },
      NOW,
      7 * DAY_MS,
    );
    expect(r.listingData).toEqual({
      featured: true,
      featuredUntil: inDays(11),
      pinned: true,
      pinnedUntil: inDays(7),
    });
    expect(r.expiresAt).toEqual(inDays(11));
  });

  it('missing listing row starts from now', () => {
    const r = extendBoostUntil('featured', null, NOW, DAY_MS);
    expect(r.expiresAt).toEqual(inDays(1));
  });
});

// ── In-memory store shared by the fulfilment-path tests ──────────────────────

type ListingRow = {
  id: string;
  arabicTitle: string;
  views: number;
  featured: boolean;
  featuredUntil: Date | null;
  pinned: boolean;
  pinnedUntil: Date | null;
  promoted: boolean;
  promotedUntil: Date | null;
};

function makeStore(listing: Partial<ListingRow>) {
  const listingRow: ListingRow = {
    id: 'l1',
    arabicTitle: 'إعلان',
    views: 5,
    featured: false,
    featuredUntil: null,
    pinned: false,
    pinnedUntil: null,
    promoted: false,
    promotedUntil: null,
    ...listing,
  };
  const payments: Record<string, { status: string; metadata: unknown }> = {
    pay1: { status: 'pending', metadata: {} },
  };
  const boosts: Record<string, Record<string, unknown>> = {
    b1: {
      id: 'b1',
      userId: 'u1',
      listingId: 'l1',
      boostType: 'featured',
      durationDays: 7,
      status: 'pending',
      expiresAt: null,
    },
  };
  const promotions: Record<string, Record<string, unknown>> = {
    p1: {
      id: 'p1',
      userId: 'u1',
      listingId: 'l1',
      durationDays: 7,
      status: 'pending',
      tier: 'basic',
      weight: 2,
      baselineViews: 0,
      expiresAt: null,
    },
  };
  const pick = (row: Record<string, unknown>, select?: object) =>
    select
      ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]]))
      : { ...row };
  const listingUpdate = jest.fn(({ data }: { data: Partial<ListingRow> }) => {
    Object.assign(listingRow, data);
    return Promise.resolve({ ...listingRow });
  });
  const client = {
    payment: {
      updateMany: jest.fn(
        ({
          where,
          data,
        }: { where: { id: string; status: string } } & {
          data: { status: string };
        }) => {
          const row = payments[where.id];
          if (!row || row.status !== where.status) {
            return Promise.resolve({ count: 0 });
          }
          row.status = data.status;
          return Promise.resolve({ count: 1 });
        },
      ),
      findFirst: jest.fn(() => Promise.resolve(payments.pay1)),
      findUnique: jest.fn(() => Promise.resolve(payments.pay1)),
    },
    listing: {
      findUnique: jest.fn(({ select }: { select?: object }) =>
        Promise.resolve(
          pick(listingRow as unknown as Record<string, unknown>, select),
        ),
      ),
      update: listingUpdate,
    },
    listingBoost: {
      findUnique: jest.fn(
        ({
          where,
          select,
          include,
        }: {
          where: { id: string };
          select?: object;
          include?: { listing?: { select?: object } };
        }) => {
          const row = boosts[where.id];
          if (!row) return Promise.resolve(null);
          const out = pick(row, select);
          if (include?.listing) {
            out.listing = pick(
              listingRow as unknown as Record<string, unknown>,
              include.listing.select,
            );
          }
          return Promise.resolve(out);
        },
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: object }) => {
          Object.assign(boosts[where.id], data);
          return Promise.resolve({ ...boosts[where.id] });
        },
      ),
    },
    listingPromotion: {
      findUnique: jest.fn(
        ({
          where,
          select,
          include,
        }: {
          where: { id: string };
          select?: object;
          include?: { listing?: { select?: object } };
        }) => {
          const row = promotions[where.id];
          if (!row) return Promise.resolve(null);
          const out = pick(row, select);
          if (include?.listing) {
            out.listing = pick(
              listingRow as unknown as Record<string, unknown>,
              include.listing.select,
            );
          }
          return Promise.resolve(out);
        },
      ),
      update: jest.fn(
        ({ where, data }: { where: { id: string }; data: object }) => {
          Object.assign(promotions[where.id], data);
          return Promise.resolve({ ...promotions[where.id] });
        },
      ),
    },
  };
  const prisma = {
    ...client,
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: typeof client) => unknown)(client)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  return { prisma, listingRow, payments, boosts, promotions, listingUpdate };
}

function makeServices(prisma: unknown) {
  const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
  const notifications = { notifyUser: jest.fn().mockResolvedValue(undefined) };
  const cache = {
    del: jest.fn().mockResolvedValue(undefined),
    delPattern: jest.fn().mockResolvedValue(0),
  };
  const args = [
    prisma,
    logger,
    notifications,
    cache,
    {},
    {},
  ] as unknown as ConstructorParameters<typeof ListingBoostService>;
  return {
    boosts: new ListingBoostService(...args),
    promotions: new ListingPromotionService(...args),
    notifications,
  };
}

beforeEach(() => {
  jest.useFakeTimers({
    doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
  });
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('PaymentsRepository.processSuccessfulPayment (webhook + return URL)', () => {
  const boostParams = (type: 'featured_ad' | 'pinned_ad') => ({
    paymentId: 'pay1',
    niTransactionId: 'ni-1',
    type,
    referenceId: 'b1',
    userId: 'u1',
    targetPlanId: undefined,
    billingCycle: 'monthly',
    storedMeta: { durationHours: 7 * 24 },
  });
  const promoParams = {
    paymentId: 'pay1',
    niTransactionId: 'ni-1',
    type: 'promoted_ad',
    referenceId: 'p1',
    userId: 'u1',
    targetPlanId: undefined,
    billingCycle: 'monthly',
    storedMeta: { durationHours: 7 * 24 },
  };

  it('active featured boost extends from featuredUntil', async () => {
    const store = makeStore({ featured: true, featuredUntil: inDays(3) });
    const repo = new PaymentsRepository(store.prisma as never);

    const res = await repo.processSuccessfulPayment(boostParams('featured_ad'));

    expect(res.processed).toBe(true);
    expect(res.boost?.expiresAt).toEqual(inDays(10));
    expect(store.listingRow.featuredUntil).toEqual(inDays(10));
    expect(store.boosts.b1.expiresAt).toEqual(inDays(10));
    expect(store.boosts.b1.status).toBe('paid');
  });

  it('active pinned boost extends from pinnedUntil (not featuredUntil)', async () => {
    const store = makeStore({
      pinned: true,
      pinnedUntil: inDays(1),
      featuredUntil: inDays(30),
    });
    store.boosts.b1.boostType = 'pinned';
    const repo = new PaymentsRepository(store.prisma as never);

    await repo.processSuccessfulPayment(boostParams('pinned_ad'));

    expect(store.listingRow.pinnedUntil).toEqual(inDays(8));
    expect(store.listingRow.featuredUntil).toEqual(inDays(30));
  });

  it('expired or null featuredUntil starts from now', async () => {
    const expired = makeStore({ featured: true, featuredUntil: inDays(-2) });
    await new PaymentsRepository(
      expired.prisma as never,
    ).processSuccessfulPayment(boostParams('featured_ad'));
    expect(expired.listingRow.featuredUntil).toEqual(inDays(7));

    // Subscription-plan featuring: featured=true without an Until.
    const planFeatured = makeStore({ featured: true, featuredUntil: null });
    await new PaymentsRepository(
      planFeatured.prisma as never,
    ).processSuccessfulPayment(boostParams('featured_ad'));
    expect(planFeatured.listingRow.featuredUntil).toEqual(inDays(7));
  });

  it('a duplicate webhook for the same payment does not extend twice', async () => {
    const store = makeStore({ featured: true, featuredUntil: inDays(3) });
    const repo = new PaymentsRepository(store.prisma as never);

    await repo.processSuccessfulPayment(boostParams('featured_ad'));
    const second = await repo.processSuccessfulPayment(
      boostParams('featured_ad'),
    );

    expect(second.processed).toBe(false);
    expect(second.boost).toBeUndefined();
    expect(store.listingRow.featuredUntil).toEqual(inDays(10));
    expect(store.listingUpdate).toHaveBeenCalledTimes(1);
  });

  it('an already-paid boost row is never extended again (row-level guard)', async () => {
    const store = makeStore({ featured: true, featuredUntil: inDays(3) });
    store.boosts.b1.status = 'paid';
    const repo = new PaymentsRepository(store.prisma as never);

    const res = await repo.processSuccessfulPayment(boostParams('featured_ad'));

    expect(res.boost).toBeUndefined();
    expect(store.listingRow.featuredUntil).toEqual(inDays(3));
    expect(store.listingUpdate).not.toHaveBeenCalled();
  });

  it('active promotion extends from promotedUntil; expired starts from now', async () => {
    const active = makeStore({ promoted: true, promotedUntil: inDays(2) });
    const res = await new PaymentsRepository(
      active.prisma as never,
    ).processSuccessfulPayment(promoParams);
    expect(res.promotion?.expiresAt).toEqual(inDays(9));
    expect(active.listingRow.promotedUntil).toEqual(inDays(9));
    expect(active.promotions.p1.expiresAt).toEqual(inDays(9));

    const expired = makeStore({ promoted: true, promotedUntil: inDays(-1) });
    await new PaymentsRepository(
      expired.prisma as never,
    ).processSuccessfulPayment(promoParams);
    expect(expired.listingRow.promotedUntil).toEqual(inDays(7));
  });

  it('a duplicate promotion webhook does not extend twice', async () => {
    const store = makeStore({ promoted: true, promotedUntil: inDays(2) });
    const repo = new PaymentsRepository(store.prisma as never);

    await repo.processSuccessfulPayment(promoParams);
    const second = await repo.processSuccessfulPayment(promoParams);

    expect(second.processed).toBe(false);
    expect(store.listingRow.promotedUntil).toEqual(inDays(9));
    expect(store.listingUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('ListingBoostService.fulfillBoost', () => {
  it('active boost extends from featuredUntil', async () => {
    const store = makeStore({ featured: true, featuredUntil: inDays(3) });
    store.payments.pay1.metadata = { durationHours: 7 * 24 };
    const { boosts, notifications } = makeServices(store.prisma);

    const res = await boosts.fulfillBoost('b1', 'ni-1');

    expect(res.processed).toBe(true);
    expect(res.boost?.expiresAt).toEqual(inDays(10));
    expect(store.listingRow.featuredUntil).toEqual(inDays(10));
    expect(store.boosts.b1.expiresAt).toEqual(inDays(10));
    expect(notifications.notifyUser).toHaveBeenCalledTimes(1);
  });

  it('expired boost starts from now', async () => {
    const store = makeStore({ featured: false, featuredUntil: inDays(-5) });
    const { boosts } = makeServices(store.prisma);

    await boosts.fulfillBoost('b1', 'ni-1');

    expect(store.listingRow.featuredUntil).toEqual(inDays(7));
  });

  it('a duplicate fulfilment for the same boost does not extend twice', async () => {
    const store = makeStore({ featured: true, featuredUntil: inDays(3) });
    const { boosts } = makeServices(store.prisma);

    await boosts.fulfillBoost('b1', 'ni-1');
    const second = await boosts.fulfillBoost('b1', 'ni-1');

    expect(second).toEqual({ processed: false });
    expect(store.listingRow.featuredUntil).toEqual(inDays(10));
    expect(store.listingUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('ListingPromotionService.fulfillPromotion', () => {
  it('active promotion extends from promotedUntil', async () => {
    const store = makeStore({ promoted: true, promotedUntil: inDays(4) });
    const { promotions } = makeServices(store.prisma);

    const res = await promotions.fulfillPromotion('p1', 'ni-1');

    expect(res.processed).toBe(true);
    expect(res.promotion?.expiresAt).toEqual(inDays(11));
    expect(store.listingRow.promotedUntil).toEqual(inDays(11));
    expect(store.promotions.p1.expiresAt).toEqual(inDays(11));
  });

  it('expired promotion starts from now', async () => {
    const store = makeStore({ promoted: false, promotedUntil: inDays(-1) });
    const { promotions } = makeServices(store.prisma);

    await promotions.fulfillPromotion('p1', 'ni-1');

    expect(store.listingRow.promotedUntil).toEqual(inDays(7));
  });

  it('a duplicate fulfilment for the same promotion does not extend twice', async () => {
    const store = makeStore({ promoted: true, promotedUntil: inDays(4) });
    const { promotions } = makeServices(store.prisma);

    await promotions.fulfillPromotion('p1', 'ni-1');
    const second = await promotions.fulfillPromotion('p1', 'ni-1');

    expect(second).toEqual({ processed: false });
    expect(store.listingRow.promotedUntil).toEqual(inDays(11));
    expect(store.listingUpdate).toHaveBeenCalledTimes(1);
  });
});
