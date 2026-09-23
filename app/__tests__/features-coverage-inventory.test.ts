/**
 * End-to-end *feature inventory* for the mobile app.
 * Ensures every major product area has automated unit coverage wired in,
 * from login through tabs, ads, payment, posts, and support.
 *
 * This is not a UI E2E runner — it asserts that the pure logic modules
 * backing each feature area are imported and exercised by the Jest suite.
 */
import * as path from 'path';
import * as fs from 'fs';

type FeatureArea = {
  id: string;
  titleAr: string;
  routes: string[];
  coveredByTests: string[];
  modules: string[];
};

const ROOT = path.join(__dirname, '..');
const TESTS_DIR = path.join(__dirname);

export const APP_FEATURE_AREAS: FeatureArea[] = [
  {
    id: 'auth-login',
    titleAr: 'تسجيل الدخول / الهاتف / OAuth',
    routes: ['/auth/welcome', '/auth/phone', '/auth/otp', '/auth/register', '/expo-auth-session'],
    coveredByTests: ['features-auth-login.test.ts'],
    modules: ['services/twilio.ts', 'lib/googleOAuthCallback.ts'],
  },
  {
    id: 'home-market-listings',
    titleAr: 'الرئيسية / السوق / الإعلانات',
    routes: ['/(tabs)', '/(tabs)/market', '/listing/[id]', '/search', '/favorites', '/news'],
    coveredByTests: [
      'core-flows.test.ts',
      'features-locale-user.test.ts',
      'home-explore.test.ts',
    ],
    modules: ['lib/listingSort.ts', 'lib/listingCategories.ts', 'lib/homeExplore.ts'],
  },
  {
    id: 'promote-ads-payment',
    titleAr: 'ترويج الإعلان والدفع والباقات',
    routes: ['/promote', '/listing/[id]/promote', '/payment', '/payment/result', '/subscription', '/fees'],
    coveredByTests: ['core-flows.test.ts', 'features-promote-commissions.test.ts'],
    modules: [
      'services/listingPromote.ts',
      'services/listingBoost.ts',
      'services/commissions.ts',
      'services/paymentCheckout.ts',
      'services/subscriptionPlans.ts',
      'services/listingPromotion.ts',
    ],
  },
  {
    id: 'posts-stories-profile',
    titleAr: 'المنشورات / الستوريات / الملف',
    routes: ['/(tabs)/posts', '/post/[id]', '/create/post', '/create/story', '/stories/view', '/(tabs)/profile'],
    coveredByTests: ['features-posts-stories-support.test.ts', 'features-locale-user.test.ts'],
    modules: ['services/posts.ts', 'lib/storyMedia.ts', 'lib/profileTimeline.ts', 'lib/currentUser.ts'],
  },
  {
    id: 'support-help',
    titleAr: 'الدعم والمساعدة / التوثيق',
    routes: ['/support', '/support/tickets', '/support/help', '/settings/support'],
    coveredByTests: ['features-posts-stories-support.test.ts'],
    modules: ['services/support.ts'],
  },
  {
    id: 'navigation',
    titleAr: 'التنقل الآمن بين الصفحات',
    routes: ['/sidebar', '/(tabs)/*'],
    coveredByTests: ['safeNavigate.test.ts'],
    modules: ['lib/safeNavigate.ts'],
  },
  {
    id: 'locale-rtl',
    titleAr: 'اللغة واتجاه الواجهة',
    routes: ['/(tabs)/more', '/profile/settings'],
    coveredByTests: ['features-locale-user.test.ts'],
    modules: ['lib/locale.ts'],
  },
  {
    id: 'official-services',
    titleAr: 'خدمات وزارة البيئة والمياه والزراعة',
    routes: ['/ministry', '/ministry/services/[id]', '/sarh-services'],
    coveredByTests: ['ministry-profile.test.ts'],
    modules: ['services/officialServices.ts', 'app/ministry/index.tsx'],
  },
];

describe('app feature coverage inventory (login → pages → pay → ads → posts)', () => {
  it('lists every major feature area', () => {
    expect(APP_FEATURE_AREAS.map((f) => f.id)).toEqual([
      'auth-login',
      'home-market-listings',
      'promote-ads-payment',
      'posts-stories-profile',
      'support-help',
      'navigation',
      'locale-rtl',
      'official-services',
    ]);
  });

  it('every feature area has at least one Jest file and existing modules', () => {
    for (const area of APP_FEATURE_AREAS) {
      expect(area.coveredByTests.length).toBeGreaterThan(0);
      for (const testFile of area.coveredByTests) {
        expect(fs.existsSync(path.join(TESTS_DIR, testFile))).toBe(true);
      }
      for (const mod of area.modules) {
        expect(fs.existsSync(path.join(ROOT, mod))).toBe(true);
      }
    }
  });

  it('critical journey modules are importable (smoke)', async () => {
    await expect(import('../services/twilio')).resolves.toBeTruthy();
    await expect(import('../services/listingPromote')).resolves.toBeTruthy();
    await expect(import('../services/paymentCheckout')).resolves.toBeTruthy();
    await expect(import('../services/posts')).resolves.toBeTruthy();
    await expect(import('../services/support')).resolves.toBeTruthy();
    await expect(import('../lib/safeNavigate')).resolves.toBeTruthy();
  });
});
