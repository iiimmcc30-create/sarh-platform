import { readFileSync } from 'fs';
import path from 'path';
import {
  FREE_BOOST_UPSELL_AR,
  PROMOTE_BENEFITS,
  PROMOTE_BEST_VALUE_BADGE,
  PROMOTE_SERVICE_COPY,
  buildPromotePlans,
  formatSar,
  freeBoostCtaTitle,
  hasPromotionStats,
  promoteCommonBenefits,
  promoteCtaLabel,
  shouldShowFreeBoostUpsell,
} from '@/lib/promotePage';
import { PROMOTE_CATALOG, listPromoteCatalogOptions } from '@/services/promoteCatalog';

const src = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8');
const screen = src('app/listing/[id]/promote.tsx');
const freeOption = src('components/listing/FreeBoostOption.tsx');

describe('boost screen — plans from the catalog', () => {
  it('renders one plan card per catalog row with the catalog price', () => {
    for (const { goal } of PROMOTE_SERVICE_COPY) {
      const rows = listPromoteCatalogOptions(goal);
      const plans = buildPromotePlans(rows);
      expect(plans).toHaveLength(rows.length);
      plans.forEach((plan, i) => {
        expect(plan.amount).toBe(rows[i].amount);
        expect(plan.durationHours).toBe(rows[i].durationHours);
        expect(plan.labelAr).toBe(rows[i].labelAr);
        expect(plan.priceLabel).toBe(formatSar(rows[i].amount));
      });
    }
  });

  it('derives per-day price and saving only from catalog arithmetic', () => {
    const featured = buildPromotePlans(listPromoteCatalogOptions('featured'));
    expect(featured[0]).toMatchObject({ amount: 9, perDayLabel: null, savingLabel: null, bestValue: false });
    expect(featured[1]).toMatchObject({
      amount: 25,
      perDayLabel: '≈ 8.3 ر.س لليوم',
      savingLabel: 'وفّر 2 ر.س',
      bestValue: true,
    });
    const pinned = buildPromotePlans(listPromoteCatalogOptions('pinned'));
    expect(pinned[1]).toMatchObject({ amount: 29, savingLabel: 'وفّر 7 ر.س', bestValue: true });
    const visibility = buildPromotePlans(listPromoteCatalogOptions('visibility'));
    expect(visibility[1]).toMatchObject({ amount: 35, perDayLabel: '≈ 17.5 ر.س لليوم', savingLabel: 'وفّر 3 ر.س' });
  });

  it('marks at most one best-value plan and none without a real saving', () => {
    for (const { goal } of PROMOTE_SERVICE_COPY) {
      const plans = buildPromotePlans(listPromoteCatalogOptions(goal));
      expect(plans.filter((p) => p.bestValue).length).toBeLessThanOrEqual(1);
    }
    expect(buildPromotePlans([{ durationDays: 1, durationHours: 24, amount: 9, labelAr: 'يوم واحد' }])[0].bestValue).toBe(false);
    expect(
      buildPromotePlans([
        { durationDays: 1, durationHours: 24, amount: 9, labelAr: 'يوم واحد' },
        { durationDays: 3, durationHours: 72, amount: 30, labelAr: '٣ أيام' },
      ]).some((p) => p.bestValue),
    ).toBe(false);
    expect(PROMOTE_BEST_VALUE_BADGE).toBe('الأوفر');
    expect(screen).not.toContain('الأكثر اختياراً');
  });

  it('screen builds plans from listPromoteCatalogOptions, never hard-coded prices', () => {
    expect(screen).toContain('buildPromotePlans(selectedService.durations)');
    expect(screen).toContain('durations: listPromoteCatalogOptions(s.goal)');
    for (const row of PROMOTE_CATALOG) {
      expect(screen).not.toMatch(new RegExp(`amount:\\s*${row.amount}\\b`));
    }
  });

  it('benefits exist for exactly the catalog services and carry no invented numbers', () => {
    expect(Object.keys(PROMOTE_BENEFITS).sort()).toEqual(['featured', 'pinned', 'visibility']);
    for (const list of Object.values(PROMOTE_BENEFITS)) {
      for (const b of list) expect(b.text).not.toMatch(/[0-9٠-٩]/);
    }
    expect(promoteCommonBenefits('٣ أيام').map((b) => b.text)).toEqual([
      'يبقى مفعّلاً لمدة ٣ أيام',
      'دفعة واحدة بدون تجديد تلقائي',
    ]);
    expect(promoteCommonBenefits(null)).toHaveLength(1);
  });
});

describe('boost screen — free boost path', () => {
  it('titles the prominent free option with the remaining count', () => {
    expect(freeBoostCtaTitle(2)).toBe('استخدم تعزيز مجاني (متبقي 2)');
    expect(freeBoostCtaTitle(-1)).toBe('استخدم تعزيز مجاني (متبقي 0)');
  });

  it('shows the upsell only when the server says the user has no perk', () => {
    expect(shouldShowFreeBoostUpsell({ eligible: false }, true)).toBe(true);
    expect(shouldShowFreeBoostUpsell({ eligible: true }, true)).toBe(false);
    expect(shouldShowFreeBoostUpsell(null, true)).toBe(false); // request failed → say nothing
    expect(shouldShowFreeBoostUpsell({ eligible: false }, false)).toBe(false);
    expect(FREE_BOOST_UPSELL_AR).toContain('أزرق+');
  });

  it('wires the existing FreeBoostOption (prominent) and the upsell on the screen', () => {
    expect(screen).toContain('<FreeBoostOption');
    expect(screen).toContain('appearance="prominent"');
    expect(screen).toContain('onQuota={onFreeQuota}');
    expect(screen).toContain('shouldShowFreeBoostUpsell(freeQuota, freeQuotaLoaded)');
    expect(screen).toContain("router.push('/verification' as never)");
  });

  it('FreeBoostOption stays hidden without the perk and keeps the sheet look by default', () => {
    expect(freeOption).toContain('if (!enabled || !quota?.eligible) return null;');
    expect(freeOption).toContain("appearance = 'default'");
    expect(freeOption).toContain('prominent ? freeBoostCtaTitle(quota.remaining) : freeBoostTitle(quota.remaining)');
    expect(freeOption).toContain('onQuotaRef.current?.(q)');
    expect(freeOption).toContain('applyFreeBoost(listingId)');
  });
});

describe('boost screen — sticky CTA total', () => {
  it('labels the pill with the catalog total in riyals', () => {
    expect(promoteCtaLabel(25)).toBe('عزّز الآن · 25 ريال');
    expect(promoteCtaLabel(9)).toBe('عزّز الآن · 9 ريال');
    expect(promoteCtaLabel(null)).toBe('عزّز الآن');
  });

  it('shows total + pill in the bottom bar from the selected catalog amount', () => {
    expect(screen).toContain('displayPrice = selectedDuration?.amount ?? null');
    // Website: catalog total in SAR. iOS / Android: the store-localized price (IAP).
    expect(screen).toMatch(/totalLabel = storeBilling\s*\?\s*\(storeDisplayPrice \?\? '—'\)\s*:\s*displayPrice != null\s*\?\s*formatSar\(displayPrice\)\s*:\s*'—'/);
    expect(screen).toContain('promoteCtaLabel(displayPrice)');
    expect(screen).toContain('<BottomAction testID="promote-cta-bar">');
    expect(screen).toContain('دفع آمن');
    expect(screen).toContain('FEE_PAYMENT_METHODS.map');
  });

  it('pill is white-on-black in dark and black-on-white in light via theme tokens', () => {
    expect(screen).toMatch(/cta: \{[^}]*backgroundColor: colors\.textPrimary/);
    expect(screen).toContain('color: colors.screenRoot');
    expect(screen).not.toContain('LinearGradient');
    expect(screen).not.toMatch(/react-native-reanimated/);
  });

  it('shows a success state from the existing payment / free-boost callbacks', () => {
    expect(screen).toContain("outcome === 'paid'");
    expect(screen).toContain('testID="promote-success"');
    expect(screen).toContain("title: 'تم تمييز إعلانك مجاناً'");
  });
});

describe('boost screen — real stats only', () => {
  it('hides stats when there is nothing real to show', () => {
    expect(hasPromotionStats(null)).toBe(false);
    expect(hasPromotionStats({ impressions: 0, clicks: 0 })).toBe(false);
    expect(hasPromotionStats({ impressions: 12, clicks: 0 })).toBe(true);
    expect(screen).toContain('hasPromotionStats(stats)');
  });
});
