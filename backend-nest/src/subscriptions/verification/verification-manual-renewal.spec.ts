import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import type { FeatureValueType } from '@prisma/client';
import {
  getEffectivePlanSlug,
  hasPaidAccess,
  RENEWAL_REMINDER_DAYS,
  SUBSCRIPTION_GRACE_DAYS,
} from '../../lib/subscription-lifecycle';
import { SubscriptionLifecycleService } from '../services/subscription-lifecycle.service';
import { VerificationBadgeService } from './verification-badge.service';
import { buildAdminMembership } from './admin-membership';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const root = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const migrationDir = (suffix: string) =>
  readdirSync(path.join(root, 'prisma/migrations')).find((d) =>
    d.endsWith(suffix),
  );

/** Plan rows exactly as the two migrations leave them. */
function seededPlans() {
  const seed = read(
    `prisma/migrations/${migrationDir('_verification_tiers')}/migration.sql`,
  );
  const prices = read(
    `prisma/migrations/${migrationDir('_verification_plan_prices')}/migration.sql`,
  );
  const features = (slug: string) =>
    [...seed.matchAll(/\('([a-z-]+)', '(\w+)', '([^']*)', '(\w+)'\)/g)]
      .filter((m) => m[1] === slug)
      .map((m) => ({
        key: m[2],
        value: m[3],
        valueType: m[4] as FeatureValueType,
      }));
  const price = (slug: string) => {
    const block =
      prices.split(';').find((s) => s.includes(`"slug" = '${slug}'`)) ?? '';
    const m = block.match(/ELSE (\d+) END/);
    return {
      monthlyPrice: m ? Number(m[1]) : 0,
      isActive: /"isActive" = true/.test(block),
    };
  };
  return ['blue-badge', 'gold-badge'].map((slug) => ({
    id: `id-${slug}`,
    slug,
    name: slug,
    audience: 'USER',
    currency: 'SAR',
    ...price(slug),
    features: features(slug),
  }));
}

describe('verification plans: prices and benefits', () => {
  const plans = seededPlans();
  const blue = plans.find((p) => p.slug === 'blue-badge')!;
  const gold = plans.find((p) => p.slug === 'gold-badge')!;

  it('prices migration: additive UPDATE of the two seeded rows only (29 / 59 SAR, active)', () => {
    const sql = read(
      `prisma/migrations/${migrationDir('_verification_plan_prices')}/migration.sql`,
    );
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|ALTER|INSERT)\b/);
    expect(sql.match(/UPDATE "Plan"/g)).toHaveLength(2);
    expect(sql).toContain(
      `WHERE "slug" = 'blue-badge' AND "audience" = 'USER'`,
    );
    expect(sql).toContain(
      `WHERE "slug" = 'gold-badge' AND "audience" = 'USER'`,
    );
    // Never overwrites a price an admin already set.
    expect(sql).toContain('CASE WHEN "monthlyPrice" > 0 THEN "monthlyPrice"');
    expect(blue).toMatchObject({ monthlyPrice: 29, isActive: true });
    expect(gold).toMatchObject({ monthlyPrice: 59, isActive: true });
  });

  // Final plan values (Blue 29 / Blue+ 59 / Gold 99, +3 / +6 / +10) are
  // covered by verification-plans-final.spec.ts (migration 20260930150000).
});

describe('manual renewal lifecycle', () => {
  const renewDate = new Date('2026-11-01T09:00:00Z');
  const approvedBlue = { status: 'VERIFIED', approvedTier: 'blue' };
  const plainUser = {
    verified: false,
    verifiedTier: null,
    subscriptionBadge: false,
  };
  const at = (ms: number) => new Date(renewDate.getTime() + ms);

  it('cancel keeps benefits + badge until the paid period ends, then stops (no grace)', () => {
    const canceled = { planId: 'blue-badge', renewDate, autoRenew: false };
    const before = at(-HOUR);
    expect(hasPaidAccess(canceled, before)).toBe(true);
    expect(getEffectivePlanSlug(canceled, before)).toBe('blue-badge');
    expect(
      VerificationBadgeService.decide({
        user: plainUser,
        request: approvedBlue,
        subscription: canceled,
        now: before,
      }).verified,
    ).toBe(true);
    const after = at(HOUR);
    expect(hasPaidAccess(canceled, after)).toBe(false);
    expect(getEffectivePlanSlug(canceled, after)).toBe('free');
  });

  it('unpaid renewal: benefits + badge continue through the 3-day grace, then end', () => {
    expect(SUBSCRIPTION_GRACE_DAYS).toBe(3);
    const unpaid = { planId: 'gold-badge', renewDate, autoRenew: true };
    const granted = {
      verified: true,
      verifiedTier: 'gold',
      subscriptionBadge: true,
    };
    const approvedGold = { status: 'VERIFIED', approvedTier: 'gold' };
    const inGrace = at(2 * DAY);
    expect(hasPaidAccess(unpaid, inGrace)).toBe(true);
    expect(
      VerificationBadgeService.decide({
        user: granted,
        request: approvedGold,
        subscription: unpaid,
        now: inGrace,
      }),
    ).toMatchObject({ verified: true, verifiedTier: 'gold' });
    const afterGrace = at(3 * DAY + HOUR);
    expect(hasPaidAccess(unpaid, afterGrace)).toBe(false);
    expect(getEffectivePlanSlug(unpaid, afterGrace)).toBe('free');
    expect(
      VerificationBadgeService.decide({
        user: granted,
        request: approvedGold,
        subscription: unpaid,
        now: afterGrace,
      }),
    ).toEqual({
      verified: false,
      verifiedTier: null,
      subscriptionBadge: false,
    });
  });

  it('reminders fire at 7d, 3d, 1d and on the renewal day (once each), then expiry downgrades', async () => {
    expect([...RENEWAL_REMINDER_DAYS]).toEqual([7, 3, 1]);
    const row = {
      userId: 'u1',
      planId: 'blue-badge',
      planAudience: 'USER',
      renewDate,
      autoRenew: true,
    };
    let downgraded = false;
    const sentKeys = new Set<string>();
    const kinds: string[] = [];
    const repo = {
      findPaidSubscriptionsRenewingWithin: jest.fn(
        async (days: number, now: Date) =>
          !downgraded &&
          row.renewDate > now &&
          row.renewDate.getTime() <= now.getTime() + days * DAY
            ? [row]
            : [],
      ),
      findExpirablePaidSubscriptions: jest.fn(async (now: Date) =>
        !downgraded && row.renewDate < now ? [row] : [],
      ),
      findUserEmail: jest.fn().mockResolvedValue(null),
    };
    const cache = {
      markReminderSent: jest.fn(async (userId: string, kind: string) => {
        if (sentKeys.has(kind)) return false;
        sentKeys.add(kind);
        kinds.push(kind);
        return true;
      }),
    };
    const notifications = {
      notifyUser: jest.fn().mockResolvedValue(undefined),
    };
    const svc = new SubscriptionLifecycleService(
      repo as never,
      cache as never,
      notifications as never,
      { addEmail: jest.fn() } as never,
      { info: jest.fn(), warn: jest.fn() } as never,
      {} as never,
      {} as never,
    );
    const downgrade = jest
      .spyOn(svc, 'downgradeUser')
      .mockImplementation(async () => {
        downgraded = true;
      });

    // Existing worker cron cadence: every 6 hours.
    for (
      let t = at(-10 * DAY).getTime();
      t <= at(5 * DAY).getTime();
      t += 6 * HOUR
    ) {
      const now = new Date(t);
      await svc.processExpirationBatch(now);
      await svc.processReminderBatch(now);
    }

    expect(kinds).toEqual(['d7', 'd3', 'd1', 'd0']);
    const titles = notifications.notifyUser.mock.calls.map((c) => c[0].titleAr);
    expect(titles[3]).toBe('اليوم موعد تجديد اشتراكك');
    for (const call of notifications.notifyUser.mock.calls) {
      expect(call[0].bodyAr).not.toMatch(/تلقائي/);
    }
    expect(downgrade).toHaveBeenCalledTimes(1);
    expect(downgrade.mock.calls[0][3]).toBe('expiration');
  });

  it('admin membership summary reflects badge tier, statuses and dates', () => {
    const m = buildAdminMembership(
      {
        verified: true,
        verifiedTier: 'gold',
        subscriptionBadge: true,
        subscription: {
          planId: 'gold-badge',
          renewDate,
          autoRenew: true,
          plan: { name: 'الشارة الذهبية', monthlyPrice: 99, currency: 'SAR' },
        },
        accountVerificationRequest: {
          status: 'VERIFIED',
          requestedTier: 'gold',
          approvedTier: 'gold',
        },
      },
      {
        paidAt: new Date('2026-10-02T09:00:00Z'),
        createdAt: new Date('2026-10-02T08:59:00Z'),
        metadata: { targetPlanId: 'gold-badge' },
      },
      at(-5 * DAY),
    );
    expect(m.badge).toEqual({
      visible: true,
      tier: 'gold',
      color: 'gold',
      legacy: false,
    });
    expect(m.verification.state).toBe('approved');
    expect(m.subscription).toMatchObject({
      state: 'active',
      tier: 'gold',
      monthlyPrice: 99,
      renewDate,
      startedAt: new Date('2026-10-02T09:00:00Z'),
    });
    const legacy = buildAdminMembership(
      { verified: true, verifiedTier: null, subscription: null },
      null,
    );
    expect(legacy.badge).toEqual({
      visible: true,
      tier: 'blue',
      color: 'blue',
      legacy: true,
    });
    expect(legacy.subscription.state).toBe('none');
  });
});

describe('no automatic charge / no card saving', () => {
  const walk = (dir: string): string[] =>
    readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(`${dir}/${e.name}`)
        : e.name.endsWith('.ts') && !/\.(spec|test)\.ts$/.test(e.name)
          ? [`${dir}/${e.name}`]
          : [],
    );

  it('N-Genius orders are single PURCHASE hosted-page orders (no saved card / MIT)', () => {
    const ni = read('src/payments/ni-client.ts');
    expect(ni.match(/action: '([A-Z_]+)'/g)).toEqual(["action: 'PURCHASE'"]);
    for (const file of [
      ...walk('src/payments'),
      ...walk('src/subscriptions'),
    ]) {
      expect(read(file)).not.toMatch(
        /savedCard|tokeni[sz]|recurring|merchantInitiated|UNSCHEDULED/i,
      );
    }
  });

  it('the legacy auto_renew_attempt job only notifies (never charges) and is never enqueued', () => {
    const processor = read('src/queue/processors/subscription.processor.ts');
    const branch = processor.slice(
      processor.indexOf("case 'auto_renew_attempt'"),
    );
    expect(branch.slice(0, branch.indexOf('return;'))).toContain(
      'notifyRenewalFailed',
    );
    expect(processor).not.toMatch(/payments|ni-client|charge/i);
    const enqueuers = walk('src').filter(
      (f) =>
        f !== 'src/queue/processors/subscription.processor.ts' &&
        f !== 'src/queue/types/queue.types.ts',
    );
    for (const f of enqueuers)
      expect(read(f)).not.toContain('auto_renew_attempt');
  });

  it('subscriptions module never calls Payment Core to charge', () => {
    for (const file of walk('src/subscriptions')) {
      expect(read(file)).not.toMatch(/from '\.\.\/(\.\.\/)?payments\//);
    }
  });
});
