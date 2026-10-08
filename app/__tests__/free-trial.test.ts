import { readFileSync } from 'fs';
import path from 'path';
import {
  trialElapsedRatio,
  trialEndsInLabelAr,
  trialStatusLabelAr,
} from '@/services/verification';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('free Blue+ trial — copy helpers', () => {
  it('days-left label follows Arabic counting', () => {
    expect(trialEndsInLabelAr(0)).toBe('تنتهي خلال يوم');
    expect(trialEndsInLabelAr(1)).toBe('تنتهي خلال يوم');
    expect(trialEndsInLabelAr(2)).toBe('تنتهي خلال يومين');
    expect(trialEndsInLabelAr(5)).toBe('تنتهي خلال 5 أيام');
    expect(trialStatusLabelAr({ daysLeft: 3 })).toBe('تجربة مجانية — تنتهي خلال 3 أيام');
  });

  it('elapsed ratio is clamped and safe on bad dates', () => {
    const startedAt = '2026-10-01T00:00:00Z';
    const endsAt = '2026-10-08T00:00:00Z';
    const mid = new Date('2026-10-04T12:00:00Z').getTime();
    expect(trialElapsedRatio({ startedAt, endsAt }, mid)).toBeCloseTo(0.5, 5);
    expect(trialElapsedRatio({ startedAt, endsAt }, 0)).toBe(0);
    expect(trialElapsedRatio({ startedAt, endsAt }, Date.parse('2027-01-01'))).toBe(1);
    expect(trialElapsedRatio({ startedAt: null, endsAt })).toBe(0);
  });
});

describe('free Blue+ trial — screens', () => {
  const page = src('app/verification.tsx');
  const service = src('services/verification.ts');

  it('starts the trial through the API (no payment, no checkout)', () => {
    expect(service).toContain('/api/subscriptions/trial');
    expect(service).toMatch(/startFreeTrial[\s\S]*method: 'POST'/);
    const start = page.slice(page.indexOf('const startTrial'), page.indexOf('const cancelRenewal'));
    expect(start).toContain('startFreeTrial()');
    expect(start).not.toContain('launchPaymentCheckout');
    expect(start).not.toContain('initiateVerificationSubscription');
  });

  it('offers the trial only to eligible accounts, on the Blue+ tab, as the main CTA', () => {
    expect(page).toContain('const trialEligible = !!trial?.eligible;');
    expect(page).toContain("title: `جرّب ${ltr('Blue+')} مجانًا لمدة أسبوع`");
    expect(page).toMatch(/if \(trialEligible && trialTab\) \{\s*return \{\s*title: `جرّب/);
    // Paying directly stays one tap away.
    expect(page).toContain('أو اشترك الآن مباشرة');
    // Eligible users land on Blue+.
    expect(page).toContain("(trialEligible ? 'blue_plus' : 'blue')");
  });

  it('shows the running trial with days left and lets the user subscribe to continue', () => {
    expect(page).toContain('trialStatusLabelAr(trial)');
    expect(page).toContain('mode="active"');
    expect(page).toContain("title: `اشترك في ${ltr('Blue+')} للاستمرار`");
    // A trial is not a paid period: plans stay purchasable, no cancel button.
    expect(page).toContain('const subActive = !!sub && !trialActive &&');
  });

  it('keeps the dark sheet style: flat, no gradients / shadows, RN Animated only', () => {
    expect(page).not.toMatch(/LinearGradient|shadowOpacity|elevation:|reanimated|moti/);
    expect(page).toContain('Animated.timing(fill');
    expect(page).toContain('backgroundColor: D.surface');
  });

  it('never promises an automatic charge', () => {
    expect(page).toContain('بدون بطاقة');
    expect(page).not.toMatch(/يتجدد تلقائي|يتجدّد تلقائي|التجديد التلقائي/);
  });

  it('sidebar hints the free week next to Verification for eligible accounts only', () => {
    const panel = src('components/feature/AppSidebar.tsx');
    expect(panel).toContain('useFreeTrialEligibility()');
    expect(panel).toContain("item.key === 'verification' && trialEligible ? (");
    expect(panel).toContain('أسبوع مجاني');
    const hook = src('hooks/useFreeTrialEligibility.ts');
    expect(hook).toContain('fetchFreeTrial()');
    expect(hook).toContain('if (!userKey) return;');
  });

  it('trial notifications open the plans sheet', () => {
    const n = src('lib/notifications.ts');
    expect(n).toMatch(
      /case 'subscription_renew':[\s\S]*stringField\(data, 'screen'\) === 'verification'[\s\S]*'\/verification'/,
    );
  });
});
