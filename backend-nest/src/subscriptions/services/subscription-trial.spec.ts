import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import {
  getEffectivePlanSlug,
  getSubscriptionStatus,
  hasPaidAccess,
  shouldBlockSubscriptionPayment,
  TRIAL_DAYS,
} from '../../lib/subscription-lifecycle';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import {
  buildTrialInfo,
  SubscriptionTrialService,
  TRIAL_PLAN_SLUG,
} from './subscription-trial.service';
import { VerificationBadgeService } from '../verification/verification-badge.service';
import { buildAdminMembership } from '../verification/admin-membership';
import type { TrialActivationResult } from '../repositories/subscription-lifecycle.repository';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const T0 = new Date('2026-10-08T09:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

type Row = {
  id: string;
  userId: string;
  planId: string;
  planAudience: 'USER';
  status: string;
  renewDate: Date;
  autoRenew: boolean;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  billingCycle: string;
  listingsUsed: number;
  liveMinutesUsed: number;
  featuredAdsUsed: number;
  pinnedAdsUsed: number;
  dailyAdsUsed: number;
  createdAt: Date;
  updatedAt: Date;
};

function freeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'sub-1',
    userId: 'u1',
    planId: 'free',
    planAudience: 'USER',
    status: 'active',
    renewDate: at(30 * DAY),
    autoRenew: true,
    trialStartedAt: null,
    trialEndsAt: null,
    billingCycle: 'monthly',
    listingsUsed: 0,
    liveMinutesUsed: 0,
    featuredAdsUsed: 0,
    pinnedAdsUsed: 0,
    dailyAdsUsed: 0,
    createdAt: at(-DAY),
    updatedAt: at(-DAY),
    ...overrides,
  };
}

function trialRow(start: Date = T0): Row {
  const endsAt = new Date(start.getTime() + TRIAL_DAYS * DAY);
  return freeRow({
    planId: TRIAL_PLAN_SLUG,
    status: 'trial',
    autoRenew: false,
    renewDate: endsAt,
    trialStartedAt: start,
    trialEndsAt: endsAt,
  });
}

/**
 * In-memory stand-in for the repository. `activateTrialTx` mirrors the
 * conditional UPDATE ... WHERE (one row, checked and written in one step).
 */
function makeStore(initial: Row | null, paidPayments = 0) {
  const state = { row: initial, paidPayments };
  const repo = {
    findByUserId: jest.fn(async () => (state.row ? { ...state.row } : null)),
    countPaidSubscriptionPayments: jest.fn(async () => state.paidPayments),
    activateTrialTx: jest.fn(
      async (p: {
        userId: string;
        planSlug: string;
        startedAt: Date;
        endsAt: Date;
      }): Promise<TrialActivationResult> => {
        await Promise.resolve();
        if (state.paidPayments > 0)
          return { ok: false, reason: 'not_eligible' };
        const r = state.row;
        if (
          !r ||
          r.planId !== 'free' ||
          r.trialStartedAt !== null ||
          r.status === 'downgraded'
        ) {
          return { ok: false, reason: 'not_eligible' };
        }
        state.row = {
          ...r,
          planId: p.planSlug,
          status: 'trial',
          autoRenew: false,
          renewDate: p.endsAt,
          trialStartedAt: p.startedAt,
          trialEndsAt: p.endsAt,
        };
        return { ok: true };
      },
    ),
    downgradeToFreeTx: jest.fn(async () => {
      if (state.row) {
        state.row = { ...state.row, planId: 'free', status: 'downgraded' };
      }
      return { previousPlanId: TRIAL_PLAN_SLUG };
    }),
    findExpirablePaidSubscriptions: jest.fn(async (now: Date) =>
      state.row && state.row.planId !== 'free' && state.row.renewDate < now
        ? [{ ...state.row }]
        : [],
    ),
    // Paid renewal reminders only cover autoRenew = true rows (real query).
    findPaidSubscriptionsRenewingWithin: jest.fn(
      async (days: number, now: Date) =>
        state.row &&
        state.row.planId !== 'free' &&
        state.row.autoRenew &&
        state.row.renewDate > now &&
        state.row.renewDate.getTime() <= now.getTime() + days * DAY
          ? [{ ...state.row }]
          : [],
    ),
    findTrialsEndingWithin: jest.fn(async (hours: number, now: Date) =>
      state.row &&
      state.row.planId !== 'free' &&
      state.row.status === 'trial' &&
      state.row.renewDate > now &&
      state.row.renewDate.getTime() <= now.getTime() + hours * HOUR
        ? [{ ...state.row }]
        : [],
    ),
    findUserEmail: jest.fn().mockResolvedValue(null),
  };
  return { state, repo };
}

function makeServices(store: ReturnType<typeof makeStore>) {
  const sentKeys = new Set<string>();
  const cache = {
    invalidate: jest.fn().mockResolvedValue(undefined),
    markReminderSent: jest.fn(async (userId: string, kind: string) => {
      const key = `${userId}:${kind}`;
      if (sentKeys.has(key)) return false;
      sentKeys.add(key);
      return true;
    }),
  };
  const notifications = { notifyUser: jest.fn().mockResolvedValue(undefined) };
  const badge = { syncQuietly: jest.fn().mockResolvedValue(undefined) };
  const logger = { info: jest.fn(), warn: jest.fn() };
  const lifecycle = new SubscriptionLifecycleService(
    store.repo as never,
    cache as never,
    notifications as never,
    { addEmail: jest.fn() } as never,
    logger as never,
    {} as never,
    {} as never,
    badge as never,
  );
  jest
    .spyOn(lifecycle, 'getForUser')
    .mockImplementation(async () => null as never);
  const subscriptionsRepo = {
    upsertFree: jest.fn(async () => {
      if (!store.state.row) store.state.row = freeRow();
      return store.state.row;
    }),
  };
  const trial = new SubscriptionTrialService(
    store.repo as never,
    subscriptionsRepo as never,
    lifecycle,
    cache as never,
    logger as never,
    badge as never,
  );
  return { trial, lifecycle, notifications, badge, cache };
}

describe('Free Blue+ trial — eligibility', () => {
  it('a fresh account (no row yet or free row) is eligible', () => {
    expect(buildTrialInfo(null, false, T0).eligible).toBe(true);
    expect(buildTrialInfo(freeRow(), false, T0).eligible).toBe(true);
  });

  it('an account that ever paid for a subscription is not eligible', () => {
    expect(buildTrialInfo(freeRow(), true, T0).eligible).toBe(false);
    // Downgraded from a paid plan (payment history may be gone).
    expect(
      buildTrialInfo(freeRow({ status: 'downgraded' }), false, T0).eligible,
    ).toBe(false);
    // Currently on a paid plan.
    expect(
      buildTrialInfo(freeRow({ planId: 'blue-badge' }), false, T0).eligible,
    ).toBe(false);
  });

  it('a trial is one per account, ever (running or finished)', () => {
    const running = buildTrialInfo(trialRow(), false, at(2 * DAY));
    expect(running).toMatchObject({
      eligible: false,
      active: true,
      used: true,
      daysLeft: 5,
      tier: 'blue_plus',
      durationDays: 7,
    });
    const finished = buildTrialInfo(
      freeRow({
        status: 'downgraded',
        trialStartedAt: T0,
        trialEndsAt: at(7 * DAY),
      }),
      false,
      at(8 * DAY),
    );
    expect(finished).toMatchObject({
      eligible: false,
      active: false,
      used: true,
    });
    // Even if something reset the status, the trial date keeps it used.
    expect(
      buildTrialInfo(freeRow({ trialStartedAt: T0 }), false, at(9 * DAY))
        .eligible,
    ).toBe(false);
  });

  it('daysLeft counts whole days left, rounded up', () => {
    expect(buildTrialInfo(trialRow(), false, at(1)).daysLeft).toBe(7);
    expect(buildTrialInfo(trialRow(), false, at(6 * DAY + HOUR)).daysLeft).toBe(
      1,
    );
    expect(buildTrialInfo(trialRow(), false, at(7 * DAY)).daysLeft).toBe(0);
  });
});

describe('Free Blue+ trial — activation', () => {
  it('starts Blue+ for exactly 7 days, no auto-renew, and syncs the badge', async () => {
    const store = makeStore(null);
    const { trial, badge, cache } = makeServices(store);
    const res = await trial.activate('u1', T0);
    expect(store.state.row).toMatchObject({
      planId: 'blue-plus-badge',
      status: 'trial',
      autoRenew: false,
      renewDate: at(7 * DAY),
      trialStartedAt: T0,
      trialEndsAt: at(7 * DAY),
    });
    expect(res.trial).toMatchObject({
      active: true,
      used: true,
      eligible: false,
    });
    expect(badge.syncQuietly).toHaveBeenCalledWith('u1');
    expect(cache.invalidate).toHaveBeenCalledWith('u1');
  });

  it('a second activation is refused (409 trial_not_eligible)', async () => {
    const store = makeStore(freeRow());
    const { trial } = makeServices(store);
    await trial.activate('u1', T0);
    await expect(trial.activate('u1', at(HOUR))).rejects.toMatchObject({
      status: 409,
    });
    await expect(trial.activate('u1', at(HOUR))).rejects.toThrow(
      /مرة واحدة فقط/,
    );
    // The first trial is untouched.
    expect(store.state.row?.trialEndsAt).toEqual(at(7 * DAY));
  });

  it('two concurrent taps: exactly one wins', async () => {
    const store = makeStore(freeRow());
    const { trial } = makeServices(store);
    const results = await Promise.allSettled([
      trial.activate('u1', T0),
      trial.activate('u1', T0),
      trial.activate('u1', T0),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(2);
  });

  it('refuses accounts that paid before, and after the trial ended', async () => {
    const paid = makeStore(freeRow(), 1);
    await expect(
      makeServices(paid).trial.activate('u1', T0),
    ).rejects.toMatchObject({
      status: 409,
    });

    const used = makeStore(
      freeRow({
        status: 'downgraded',
        trialStartedAt: T0,
        trialEndsAt: at(7 * DAY),
      }),
    );
    await expect(
      makeServices(used).trial.activate('u1', at(10 * DAY)),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('reports the plan as unavailable when Blue+ is not on sale', async () => {
    const store = makeStore(freeRow());
    store.repo.activateTrialTx.mockResolvedValueOnce({
      ok: false,
      reason: 'plan_unavailable',
    });
    await expect(makeServices(store).trial.activate('u1', T0)).rejects.toThrow(
      /غير متاحة/,
    );
  });
});

describe('Free Blue+ trial — expiry, reminders, payments, badge', () => {
  it('access ends exactly at the trial end (no grace period)', () => {
    const row = trialRow();
    expect(hasPaidAccess(row, at(7 * DAY - 1))).toBe(true);
    expect(getEffectivePlanSlug(row, at(7 * DAY - 1))).toBe('blue-plus-badge');
    expect(hasPaidAccess(row, at(7 * DAY + 1))).toBe(false);
    expect(getEffectivePlanSlug(row, at(7 * DAY + 1))).toBe('free');
    expect(getSubscriptionStatus(row, at(7 * DAY + 1))).toBe('expired');
  });

  it('daily jobs: one "1 day left" reminder, no paid reminders, then downgrade with the trial-ended message', async () => {
    const store = makeStore(null);
    const { trial, lifecycle, notifications } = makeServices(store);
    // The trial starts at an odd hour; the existing cron runs once a day.
    const start = at(5 * HOUR + 17 * 60 * 1000);
    await trial.activate('u1', start);

    for (let t = T0.getTime(); t <= at(10 * DAY).getTime(); t += DAY) {
      const now = new Date(t);
      await lifecycle.processExpirationBatch(now);
      await lifecycle.processReminderBatch(now);
    }

    const titles = notifications.notifyUser.mock.calls.map((c) => c[0].titleAr);
    expect(titles).toEqual([
      'باقي يوم على نهاية تجربتك المجانية',
      'انتهت تجربتك المجانية',
    ]);
    for (const call of notifications.notifyUser.mock.calls) {
      expect(call[0].data.screen).toBe('verification');
    }
    expect(store.repo.downgradeToFreeTx).toHaveBeenCalledTimes(1);
    expect(store.state.row).toMatchObject({
      planId: 'free',
      status: 'downgraded',
    });
    expect(buildTrialInfo(store.state.row, false, at(11 * DAY)).eligible).toBe(
      false,
    );
  });

  it('an ended trial is downgraded on read (expireIfEnded); a running one is not', async () => {
    const store = makeStore(trialRow());
    const { trial } = makeServices(store);
    await trial.expireIfEnded('u1', at(3 * DAY));
    expect(store.repo.downgradeToFreeTx).not.toHaveBeenCalled();
    jest.useFakeTimers().setSystemTime(at(7 * DAY + HOUR));
    try {
      await trial.expireIfEnded('u1', at(7 * DAY + HOUR));
    } finally {
      jest.useRealTimers();
    }
    expect(store.repo.downgradeToFreeTx).toHaveBeenCalledTimes(1);
  });

  it('cancel during the trial is a no-op (no "renewal cancelled" message)', async () => {
    const store = makeStore(trialRow());
    const { lifecycle, notifications } = makeServices(store);
    (store.repo as Record<string, unknown>).setAutoRenew = jest.fn();
    const view = await lifecycle.cancelAutoRenew('u1');
    expect(view).toMatchObject({ isTrial: true });
    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });

  it('a running trial never blocks paying for a real plan (same plan included)', () => {
    const tierOf = (s: string) =>
      ({ free: 0, 'blue-badge': 1, 'blue-plus-badge': 2, 'gold-badge': 3 })[
        s
      ] ?? 0;
    const row = trialRow();
    for (const target of ['blue-badge', 'blue-plus-badge', 'gold-badge']) {
      expect(shouldBlockSubscriptionPayment(row, target, tierOf, at(DAY))).toBe(
        false,
      );
    }
    // Unchanged for a paid period: early renewal of the same plan is blocked.
    const paid = { ...row, status: 'active', autoRenew: true };
    expect(
      shouldBlockSubscriptionPayment(paid, 'blue-plus-badge', tierOf, at(DAY)),
    ).toBe(true);
  });

  it('badge: blue while the trial runs, removed after it ends; legacy badges are kept', () => {
    const row = trialRow();
    const user = {
      verified: false,
      verifiedTier: null,
      subscriptionBadge: false,
    };
    expect(
      VerificationBadgeService.decide({
        user,
        request: null,
        subscription: row,
        now: at(DAY),
      }),
    ).toEqual({
      verified: true,
      verifiedTier: 'blue_plus',
      subscriptionBadge: true,
    });
    expect(
      VerificationBadgeService.decide({
        user: {
          verified: true,
          verifiedTier: 'blue_plus',
          subscriptionBadge: true,
        },
        request: null,
        subscription: row,
        now: at(7 * DAY + 1),
      }),
    ).toEqual({
      verified: false,
      verifiedTier: null,
      subscriptionBadge: false,
    });
    expect(
      VerificationBadgeService.decide({
        user: { verified: true, verifiedTier: null, subscriptionBadge: false },
        request: null,
        subscription: row,
        now: at(7 * DAY + 1),
      }),
    ).toEqual({ verified: true, verifiedTier: null, subscriptionBadge: false });
  });

  it('admin membership shows the trial as the source', () => {
    const m = buildAdminMembership(
      {
        verified: true,
        verifiedTier: 'blue_plus',
        subscriptionBadge: true,
        subscription: { ...trialRow(), plan: null },
        accountVerificationRequest: null,
      },
      null,
      at(DAY),
    );
    expect(m.subscription).toMatchObject({
      source: 'trial',
      tier: 'blue_plus',
      trialStartedAt: T0,
      trialEndsAt: at(7 * DAY),
    });
  });

  it('migration is additive and nullable only', () => {
    const root = path.join(__dirname, '..', '..', '..');
    const dir = readdirSync(path.join(root, 'prisma/migrations')).find((d) =>
      d.endsWith('_subscription_free_trial'),
    );
    expect(dir).toBeDefined();
    const sql = readFileSync(
      path.join(root, 'prisma/migrations', dir!, 'migration.sql'),
      'utf8',
    );
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE|NOT NULL)\b/);
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS "trialStartedAt" TIMESTAMP(3)',
    );
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3)',
    );
  });
});
