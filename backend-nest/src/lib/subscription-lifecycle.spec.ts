import {
  daysUntilRenewDate,
  getEffectivePlanSlug,
  getSubscriptionStatus,
  hasPaidAccess,
  isPaidPlan,
  shouldBlockSubscriptionPayment,
} from './subscription-lifecycle';

describe('subscription-lifecycle', () => {
  const now = new Date('2026-01-15T12:00:00Z');
  const tierOf = (slug: string) =>
    ({ free: 0, 'sarh-pro': 1, growth: 1 })[slug] ?? 0;

  it('free plan is not paid', () => {
    expect(isPaidPlan('free')).toBe(false);
    expect(isPaidPlan('sarh-pro')).toBe(true);
  });

  it('effective plan falls back to free when expired', () => {
    const sub = {
      planId: 'sarh-pro',
      renewDate: new Date('2026-01-01T00:00:00Z'),
      autoRenew: false,
    };
    expect(getEffectivePlanSlug(sub, now)).toBe('free');
  });

  it('grace period keeps paid plan slug', () => {
    const sub = {
      planId: 'sarh-pro',
      renewDate: new Date('2026-01-14T00:00:00Z'),
      autoRenew: true,
    };
    expect(getSubscriptionStatus(sub, now)).toBe('grace_period');
    expect(getEffectivePlanSlug(sub, now)).toBe('sarh-pro');
  });

  it('blocks early renewal of same tier', () => {
    const sub = {
      planId: 'sarh-pro',
      renewDate: new Date('2026-02-01T00:00:00Z'),
      autoRenew: true,
    };
    expect(shouldBlockSubscriptionPayment(sub, 'sarh-pro', tierOf, now)).toBe(
      true,
    );
    expect(hasPaidAccess(sub, now)).toBe(true);
  });

  it('allows upgrade while active', () => {
    const sub = {
      planId: 'free',
      renewDate: new Date('2026-02-01T00:00:00Z'),
      autoRenew: true,
    };
    expect(shouldBlockSubscriptionPayment(sub, 'sarh-pro', tierOf, now)).toBe(
      false,
    );
  });

  it('daysUntilRenewDate', () => {
    const renew = new Date('2026-01-20T12:00:00Z');
    expect(daysUntilRenewDate(renew, now)).toBe(5);
  });
});
