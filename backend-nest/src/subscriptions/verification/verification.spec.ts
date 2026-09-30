import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { VerificationBadgeService } from './verification-badge.service';
import {
  mapSubscriptionState,
  mapVerificationState,
} from './verification-status.service';
import {
  effectiveApprovedTier,
  extraDailyListingsForPlan,
  resolveBadgeTier,
  TIER_REQUIRES_VERIFICATION,
  tierForPlanSlug,
} from './verification-tiers';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-09-30T08:00:00Z');
const future = new Date(now.getTime() + 10 * DAY);
const past = new Date(now.getTime() - 10 * DAY);

const plainUser = {
  verified: false,
  verifiedTier: null,
  subscriptionBadge: false,
};
const legacyUser = {
  verified: true,
  verifiedTier: null,
  subscriptionBadge: false,
};

describe('verification tiers', () => {
  it('maps plan slugs to tiers', () => {
    expect(tierForPlanSlug('blue-badge')).toBe('blue');
    expect(tierForPlanSlug('blue-plus-badge')).toBe('blue_plus');
    expect(tierForPlanSlug('gold-badge')).toBe('gold');
    expect(tierForPlanSlug('sarh-pro')).toBeNull();
    expect(tierForPlanSlug('free')).toBeNull();
  });

  it('Blue = active subscription only; Gold also needs a Gold approval', () => {
    // No subscription → no badge, whatever the approval.
    expect(
      resolveBadgeTier({ subscriptionTier: null, approvedTier: 'gold' }),
    ).toBeNull();
    expect(
      resolveBadgeTier({ subscriptionTier: null, approvedTier: null }),
    ).toBeNull();
    // Blue needs no verification at all.
    expect(
      resolveBadgeTier({ subscriptionTier: 'blue', approvedTier: null }),
    ).toBe('blue');
    expect(
      resolveBadgeTier({ subscriptionTier: 'blue', approvedTier: 'gold' }),
    ).toBe('blue');
    // Gold only with an approved Gold (merchant) verification; otherwise blue.
    expect(
      resolveBadgeTier({ subscriptionTier: 'gold', approvedTier: 'gold' }),
    ).toBe('gold');
    expect(
      resolveBadgeTier({ subscriptionTier: 'gold', approvedTier: 'blue' }),
    ).toBe('blue');
    expect(
      resolveBadgeTier({ subscriptionTier: 'gold', approvedTier: null }),
    ).toBe('blue');
    // Blue+ keeps the blue badge (never gold).
    expect(
      resolveBadgeTier({ subscriptionTier: 'blue_plus', approvedTier: null }),
    ).toBe('blue_plus');
    expect(
      resolveBadgeTier({ subscriptionTier: 'blue_plus', approvedTier: 'gold' }),
    ).toBe('blue_plus');
    expect(TIER_REQUIRES_VERIFICATION).toEqual({
      blue: false,
      blue_plus: false,
      gold: true,
    });
  });

  it('treats requests approved before tiers as blue approvals', () => {
    expect(
      effectiveApprovedTier({ status: 'VERIFIED', approvedTier: null }),
    ).toBe('blue');
    expect(
      effectiveApprovedTier({ status: 'DRAFT', approvedTier: 'blue' }),
    ).toBe('blue');
    expect(
      effectiveApprovedTier({ status: 'REJECTED', approvedTier: null }),
    ).toBeNull();
    expect(effectiveApprovedTier(null)).toBeNull();
  });

  it('extra daily listings: Blue +3, Blue+ +6, Gold +10, feature value wins', () => {
    expect(extraDailyListingsForPlan('blue-badge', undefined)).toBe(3);
    expect(extraDailyListingsForPlan('blue-plus-badge', undefined)).toBe(6);
    expect(extraDailyListingsForPlan('gold-badge', undefined)).toBe(10);
    expect(extraDailyListingsForPlan('gold-badge', 8)).toBe(8);
    expect(extraDailyListingsForPlan('free', undefined)).toBe(0);
  });
});

describe('VerificationBadgeService.decide', () => {
  const activeBlue = {
    planId: 'blue-badge',
    renewDate: future,
    autoRenew: true,
  };
  const activeGold = {
    planId: 'gold-badge',
    renewDate: future,
    autoRenew: true,
  };
  const expiredGold = {
    planId: 'gold-badge',
    renewDate: past,
    autoRenew: false,
  };
  const approvedBlue = { status: 'VERIFIED', approvedTier: 'blue' };
  const approvedGold = { status: 'VERIFIED', approvedTier: 'gold' };

  it('Blue badge with an active Blue subscription alone; Gold badge needs Gold approval', () => {
    expect(
      VerificationBadgeService.decide({
        user: plainUser,
        request: null,
        subscription: activeBlue,
        now,
      }),
    ).toEqual({
      verified: true,
      verifiedTier: 'blue',
      subscriptionBadge: true,
    });
    expect(
      VerificationBadgeService.decide({
        user: plainUser,
        request: approvedBlue,
        subscription: activeBlue,
        now,
      }),
    ).toEqual({
      verified: true,
      verifiedTier: 'blue',
      subscriptionBadge: true,
    });
    expect(
      VerificationBadgeService.decide({
        user: plainUser,
        request: approvedGold,
        subscription: activeGold,
        now,
      }),
    ).toEqual({
      verified: true,
      verifiedTier: 'gold',
      subscriptionBadge: true,
    });
    // Gold subscription without a Gold approval never shows gold.
    expect(
      VerificationBadgeService.decide({
        user: plainUser,
        request: null,
        subscription: activeGold,
        now,
      }),
    ).toEqual({
      verified: true,
      verifiedTier: 'blue',
      subscriptionBadge: true,
    });
    expect(
      VerificationBadgeService.decide({
        user: plainUser,
        request: { status: 'UNDER_REVIEW', approvedTier: null },
        subscription: activeGold,
        now,
      }).verifiedTier,
    ).toBe('blue');
    // No active subscription → no badge even when approved.
    expect(
      VerificationBadgeService.decide({
        user: plainUser,
        request: approvedGold,
        subscription: null,
        now,
      }).verified,
    ).toBe(false);
  });

  it('revokes a subscription badge when the subscription ends', () => {
    const granted = {
      verified: true,
      verifiedTier: 'gold',
      subscriptionBadge: true,
    };
    expect(
      VerificationBadgeService.decide({
        user: granted,
        request: approvedGold,
        subscription: expiredGold,
        now,
      }),
    ).toEqual({
      verified: false,
      verifiedTier: null,
      subscriptionBadge: false,
    });
    expect(
      VerificationBadgeService.decide({
        user: granted,
        request: approvedGold,
        subscription: { planId: 'free', renewDate: past, autoRenew: true },
        now,
      }).verified,
    ).toBe(false);
  });

  it('keeps a canceled subscription badge until the paid period ends', () => {
    expect(
      VerificationBadgeService.decide({
        user: plainUser,
        request: approvedBlue,
        subscription: {
          planId: 'blue-badge',
          renewDate: future,
          autoRenew: false,
        },
        now,
      }).verified,
    ).toBe(true);
  });

  it('never removes a legacy (pre-existing) verified badge', () => {
    expect(
      VerificationBadgeService.decide({
        user: legacyUser,
        request: null,
        subscription: null,
        now,
      }),
    ).toEqual({ verified: true, verifiedTier: null, subscriptionBadge: false });
    // Legacy user upgrading to gold shows gold while active, back to legacy blue after.
    const upgraded = VerificationBadgeService.decide({
      user: legacyUser,
      request: approvedGold,
      subscription: activeGold,
      now,
    });
    expect(upgraded).toEqual({
      verified: true,
      verifiedTier: 'gold',
      subscriptionBadge: false,
    });
    expect(
      VerificationBadgeService.decide({
        user: { ...legacyUser, verifiedTier: 'gold' },
        request: approvedGold,
        subscription: expiredGold,
        now,
      }),
    ).toEqual({ verified: true, verifiedTier: null, subscriptionBadge: false });
  });
});

describe('verification status mapping', () => {
  it('maps request states', () => {
    expect(mapVerificationState(null)).toBe('not_started');
    expect(mapVerificationState({ status: 'DRAFT' })).toBe('not_started');
    expect(mapVerificationState({ status: 'UNDER_REVIEW' })).toBe(
      'pending_review',
    );
    expect(
      mapVerificationState({ status: 'VERIFIED', approvedTier: 'gold' }),
    ).toBe('approved');
    expect(mapVerificationState({ status: 'REJECTED' })).toBe('rejected');
    expect(mapVerificationState({ status: 'NEEDS_AMENDMENTS' })).toBe(
      'needs_amendments',
    );
    // Gold upgrade draft keeps the blue approval visible.
    expect(
      mapVerificationState({ status: 'DRAFT', approvedTier: 'blue' }),
    ).toBe('approved');
  });

  it('maps subscription states', () => {
    expect(
      mapSubscriptionState({
        subscription: {
          planId: 'blue-badge',
          renewDate: future,
          autoRenew: true,
        },
        lastBadgePlanSlug: null,
        now,
      }),
    ).toEqual({ state: 'active', tier: 'blue' });
    expect(
      mapSubscriptionState({
        subscription: {
          planId: 'gold-badge',
          renewDate: future,
          autoRenew: false,
        },
        lastBadgePlanSlug: null,
        now,
      }),
    ).toEqual({ state: 'canceled', tier: 'gold' });
    expect(
      mapSubscriptionState({
        subscription: { planId: 'free', renewDate: past, autoRenew: true },
        lastBadgePlanSlug: 'gold-badge',
        now,
      }),
    ).toEqual({ state: 'expired', tier: 'gold' });
    expect(
      mapSubscriptionState({
        subscription: { planId: 'free', renewDate: future, autoRenew: true },
        lastBadgePlanSlug: 'sarh-pro',
        now,
      }),
    ).toEqual({ state: 'none', tier: null });
  });
});

describe('verification wiring (source guards)', () => {
  const root = path.join(__dirname, '..', '..', '..');
  const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

  it('migration is additive and seeds plans inactive with placeholder prices', () => {
    const dir = readdirSync(path.join(root, 'prisma/migrations')).find((d) =>
      d.endsWith('_verification_tiers'),
    );
    expect(dir).toBeDefined();
    const sql = read(`prisma/migrations/${dir}/migration.sql`);
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE)\b/);
    expect(sql).toContain('ADD COLUMN "verifiedTier"');
    expect(sql).toContain("'blue-badge'");
    expect(sql).toContain("'gold-badge'");
    expect(sql).toMatch(/'USER', 0, 0, 'SAR', 0, false/);
  });

  it('admin approval no longer grants the badge by itself', () => {
    const svc = read('src/support/services/account-verification.service.ts');
    expect(svc).not.toContain('data: { verified: true }');
    expect(svc).toContain('this.badge?.syncQuietly(existing.userId)');
  });

  it('does not touch Payment Core files', () => {
    const payments = read('src/payments/repositories/payments.repository.ts');
    expect(payments).not.toContain('verifiedTier');
    expect(payments).not.toContain('VerificationBadgeService');
  });
});
