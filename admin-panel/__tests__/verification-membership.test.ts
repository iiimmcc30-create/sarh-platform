import { readFileSync } from 'fs';
import path from 'path';
import {
  type AdminMembership,
  BADGE_TIER_LABEL,
  badgeColor,
  planLabel,
  planPriceLabel,
  subscriptionStatus,
  tierLabel,
} from '@/lib/membership';

const membership = (tier: 'blue' | 'blue_plus' | 'gold', price: number): AdminMembership => ({
  badge: { visible: true, tier, color: badgeColor(tier), legacy: false },
  verification: {
    state: 'not_started',
    requestStatus: null,
    requestedTier: null,
    approvedTier: null,
    submittedAt: null,
    reviewedAt: null,
  },
  subscription: {
    planId: `${tier}-badge`,
    planName: null,
    monthlyPrice: price,
    currency: 'SAR',
    state: 'active',
    lifecycle: 'active',
    tier,
    startedAt: '2026-09-30T10:00:00Z',
    renewDate: '2026-10-30T10:00:00Z',
    renewalIntent: true,
  },
});

describe('admin membership: Blue / Blue+ / Gold', () => {
  it('labels the three plans and keeps Blue+ on the blue badge', () => {
    expect(Object.keys(BADGE_TIER_LABEL)).toEqual(['blue', 'blue_plus', 'gold']);
    expect(tierLabel('blue_plus')).toContain('Blue+');
    expect(badgeColor('blue')).toBe('blue');
    expect(badgeColor('blue_plus')).toBe('blue');
    expect(badgeColor('gold')).toBe('gold');
    expect(badgeColor(null)).toBe('blue');
  });

  it('shows plan type and monthly price from the API', () => {
    expect(planLabel(membership('blue_plus', 59))).toBe(BADGE_TIER_LABEL.blue_plus);
    expect(planPriceLabel(membership('blue', 29))).toBe('29 SAR / شهر');
    expect(planPriceLabel(membership('gold', 99))).toBe('99 SAR / شهر');
  });

  it('Gold review page shows the documents and linked Gold payments', () => {
    const page = readFileSync(
      path.join(__dirname, '..', 'src/app/(dashboard)/support/verification/[id]/page.tsx'),
      'utf8',
    );
    expect(page).toContain('res.goldPayments ?? []');
    expect(page).toContain('مرتبط بدفع Gold');
    expect(page).toContain("COMMERCIAL_REGISTER: 'السجل التجاري'");
  });
});

describe('admin membership: free Blue+ trial', () => {
  it('labels a running trial as a free trial (no payment)', () => {
    const m = membership('blue_plus', 59);
    m.subscription.source = 'trial';
    m.subscription.state = 'canceled';
    expect(subscriptionStatus(m)).toEqual({ label: 'تجربة مجانية (بدون دفع)', tone: 'info' });
    m.subscription.source = 'paid';
    m.subscription.state = 'active';
    expect(subscriptionStatus(m).label).not.toContain('تجربة');
  });

  it('user page shows whether the account used its trial', () => {
    const page = readFileSync(
      path.join(__dirname, '..', 'src/app/(dashboard)/users/[id]/page.tsx'),
      'utf8',
    );
    expect(page).toContain('التجربة المجانية: ');
    expect(page).toContain('membership.subscription.trialStartedAt');
  });
});

