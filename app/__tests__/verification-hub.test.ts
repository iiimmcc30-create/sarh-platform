import { readFileSync } from 'fs';
import path from 'path';
import { buildVerificationHub, VERIFICATION_HUB_TITLE } from '@/lib/verificationHub';
import { showsGoldSellerLabel, isGoldSeller } from '@/lib/goldSeller';
import type { VerificationStatus } from '@/services/verification';

const root = path.join(__dirname, '..');
const src = (p: string) => readFileSync(path.join(root, p), 'utf8');

const plans = (['blue', 'blue_plus', 'gold'] as const).map((tier, i) => ({
  tier,
  slug: `${tier}-badge`,
  name: null,
  monthlyPrice: [29, 59, 99][i],
  currency: 'SAR',
  billingCycle: 'monthly' as const,
  priceConfigured: true,
  available: true,
  extraDailyListings: [3, 6, 10][i],
  visibilityBoost: i + 1,
  weeklyFreeBoosts: [0, 2, 4][i],
}));

function status(over: Partial<VerificationStatus> & { sub?: Partial<VerificationStatus['subscription']> } = {}): VerificationStatus {
  const { sub, ...rest } = over;
  return {
    plans,
    verification: {
      state: 'approved',
      requestStatus: 'VERIFIED',
      requestedTier: 'gold',
      approvedTier: 'gold',
      reviewReason: null,
      submittedAt: null,
      reviewedAt: null,
    },
    subscription: {
      id: 's1',
      state: 'active',
      tier: 'gold',
      planId: 'gold-badge',
      renewDate: '2026-11-09T00:00:00.000Z',
      autoRenew: true,
      isTrial: false,
      ...sub,
    },
    badge: { visible: true, tier: 'gold', color: 'gold', legacy: false },
    billing: { cycle: 'monthly', automaticCharge: false, renewal: 'x', source: 'ngenius', autoRenew: true, expiresAt: '2026-11-09T00:00:00.000Z' },
    perks: {
      tier: 'gold',
      freeBoosts: { limit: 4, used: 1, remaining: 3, nextResetAt: '2026-10-14T00:00:00.000Z' },
      dailyListings: { limit: 11, used: 2, resetsAt: null },
      profileViews30d: { count: 12, unlocked: true },
      prioritySupport: true,
      councils: { canSchedule: true, canFollowersOnly: true },
    },
    preferences: { hideVerifiedBadge: false, hideGoldSellerLabel: true },
    ...rest,
  };
}

const keysOf = (m: ReturnType<typeof buildVerificationHub>, section: string) =>
  m.sections.find((s) => s.key === section)?.rows.map((r) => r.key) ?? [];

describe('«التوثيق» hub model', () => {
  it('is named «التوثيق»', () => {
    expect(VERIFICATION_HUB_TITLE).toBe('التوثيق');
    expect(src('app/settings/verification.tsx')).toContain('title={VERIFICATION_HUB_TITLE}');
  });

  it('Gold web subscriber: header, manage + cancel renewal, live perks, both switches', () => {
    const m = buildVerificationHub({ status: status(), purchasesEnabled: true });
    expect(m.subscribed).toBe(true);
    expect(m.header).toMatchObject({ badge: 'gold', title: 'Gold', stateLine: 'فعّال' });
    expect(keysOf(m, 'subscription')).toEqual(['manage', 'cancel-renewal', 'payments']);
    expect(keysOf(m, 'perks')).toEqual([
      'free-boosts',
      'daily-listings',
      'visibility',
      'profile-views',
      'priority-support',
      'councils',
    ]);
    const perks = m.sections.find((s) => s.key === 'perks')!.rows;
    expect(perks.find((r) => r.key === 'free-boosts')!.value).toBe('٣/٤');
    expect(perks.find((r) => r.key === 'daily-listings')!.value).toBe('٢/١١');
    const sw = m.sections.find((s) => s.key === 'visibility')!.rows;
    expect(sw.map((r) => [r.key, r.switchValue])).toEqual([
      ['hide-badge', false],
      ['hide-gold-label', true],
    ]);
    expect(m.cta).toBeNull();
  });

  it('store-billed: store manage row only, never the N-Genius cancel', () => {
    const m = buildVerificationHub({
      status: status({ billing: { cycle: 'monthly', automaticCharge: false, renewal: 'x', source: 'app_store', autoRenew: true, expiresAt: '2026-11-09T00:00:00.000Z' } }),
      purchasesEnabled: true,
    });
    const rows = m.sections.find((s) => s.key === 'subscription')!.rows;
    expect(rows.map((r) => r.key)).toEqual(['manage', 'payments']);
    expect(rows[0]).toMatchObject({ action: 'manage-store', value: 'App Store' });
    expect(rows[0].description).toContain('يتجدد تلقائياً');
  });

  it('lower tiers get «ترقية إلى Gold» (hidden when purchases are off) and no gold switch', () => {
    const blue = status({
      sub: { tier: 'blue_plus', planId: 'blue-plus-badge' },
      badge: { visible: true, tier: 'blue_plus', color: 'blue', legacy: false },
      perks: {
        tier: 'blue_plus',
        freeBoosts: { limit: 2, used: 2, remaining: 0, nextResetAt: null },
        dailyListings: { limit: 7, used: 0, resetsAt: null },
        profileViews30d: { count: 0, unlocked: true },
        prioritySupport: false,
        councils: { canSchedule: true, canFollowersOnly: false },
      },
    });
    const on = buildVerificationHub({ status: blue, purchasesEnabled: true });
    expect(keysOf(on, 'subscription')).toContain('upgrade-gold');
    expect(keysOf(on, 'perks')).not.toContain('priority-support');
    expect(keysOf(on, 'visibility')).toEqual(['hide-badge']);
    const off = buildVerificationHub({ status: blue, purchasesEnabled: false });
    expect(keysOf(off, 'subscription')).not.toContain('upgrade-gold');
    // status + switches stay for existing subscribers
    expect(keysOf(off, 'visibility')).toEqual(['hide-badge']);
    expect(off.header.title).toBe('Blue+');
  });

  it('non-subscriber: «غير موثّق», trial, comparison with prices, «ترقية»', () => {
    const none = status({
      sub: { state: 'none', tier: null, planId: 'free' },
      badge: { visible: false, tier: null, color: null, legacy: false },
      billing: { cycle: 'monthly', automaticCharge: false, renewal: 'x', source: 'none', autoRenew: false, expiresAt: null },
      trial: {
        tier: 'blue_plus',
        planSlug: 'blue-plus-badge',
        durationDays: 7,
        eligible: true,
        active: false,
        used: false,
        startedAt: null,
        endsAt: null,
        daysLeft: 0,
      },
    });
    const m = buildVerificationHub({ status: none, purchasesEnabled: true });
    expect(m.subscribed).toBe(false);
    expect(m.header.title).toBe('غير موثّق');
    expect(m.sections.map((s) => s.key)).toEqual(['trial', 'compare', 'account']);
    const compare = m.sections.find((s) => s.key === 'compare')!.rows;
    expect(compare.map((r) => r.title)).toEqual(['Blue', 'Blue+', 'Gold']);
    expect(compare[2].value).toBe('99 ر.س / شهر');
    expect(compare[2].description).toContain('دعم بأولوية');
    expect(m.cta?.action).toBe('trial');

    const off = buildVerificationHub({ status: none, purchasesEnabled: false });
    expect(off.sections.map((s) => s.key)).toEqual(['account']);
    expect(off.cta).toBeNull();
    expect(JSON.stringify(off)).not.toContain('ر.س');
  });

  it('store builds show the store-localized price in the comparison', () => {
    const none = status({ sub: { state: 'none', tier: null, planId: 'free' } });
    const m = buildVerificationHub({
      status: none,
      purchasesEnabled: true,
      storeBilling: true,
      storePrices: { gold: 'SAR 99.99' },
    });
    const compare = m.sections.find((s) => s.key === 'compare')!.rows;
    expect(compare[2].value).toBe('SAR 99.99 / شهر');
    expect(compare[0].value).toBeUndefined();
  });
});

describe('«بائع ذهبي» visibility', () => {
  it('hides the label but keeps the gold seller for ranking', () => {
    const u = { verified: true, verifiedTier: 'gold', hideGoldSellerLabel: true };
    expect(isGoldSeller(u)).toBe(true);
    expect(showsGoldSellerLabel(u)).toBe(false);
    expect(showsGoldSellerLabel({ verified: true, verifiedTier: 'gold' })).toBe(true);
  });
});

describe('/verification paywall lists the real perks', () => {
  const pay = src('app/verification.tsx');
  it.each(['من شاهد ملفك', 'كل أسبوع', '«بائع ذهبي» تحت اسمك', 'إعلاناتك أولاً في منطقتك', 'جدولة المجالس', 'دعم فني بأولوية'])(
    '%s',
    (label) => expect(pay).toContain(label),
  );
  it('hides the N-Genius cancel for store-billed subscriptions (billing.source)', () => {
    expect(pay).toContain('isStoreBillingSource(billingSource)');
    expect(pay).toContain("res.code === 'manage_in_store'");
  });
});
