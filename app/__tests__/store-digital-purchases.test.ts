import { readFileSync } from 'fs';
import path from 'path';
import { Platform } from 'react-native';
import {
  DIGITAL_PURCHASES_UNAVAILABLE_TITLE_AR,
  digitalPurchasesEnabled,
  isDigitalPaymentContext,
  isDigitalPurchaseRoute,
  resolveDigitalPurchasesEnabled,
  usesStoreBilling,
  withoutDigitalPurchaseRows,
} from '@/lib/storePurchases';
import {
  applyStorePurchasePolicy,
  DEFAULT_PAID_SERVICE_FLAGS,
  fetchPaidServiceFlags,
  getCachedPaidServiceFlags,
  hasAnyBoostService,
  resetPaidServicesCache,
} from '@/services/paidServices';
import { resolveExploreCard } from '@/lib/homeExplore';
import { handleNotificationNavigation } from '@/lib/notifications';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiGet: jest.fn(),
}));
jest.mock('@/services/api', () => ({
  ensureApiReachable: async () => 'https://api.test',
}));

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

const ENV_KEYS = [
  'EXPO_PUBLIC_STORE_DIGITAL_PURCHASES',
  'EXPO_PUBLIC_STORE_DIGITAL_PURCHASES_IOS',
  'EXPO_PUBLIC_STORE_DIGITAL_PURCHASES_ANDROID',
] as const;

function withPlatform<T>(os: string, fn: () => T): T {
  const prev = Platform.OS;
  (Platform as { OS: string }).OS = os;
  try {
    return fn();
  } finally {
    (Platform as { OS: string }).OS = prev;
  }
}

describe('store build kill switch for digital purchases (IAP on native)', () => {
  const savedEnv: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    resetPaidServicesCache();
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    resetPaidServicesCache();
    jest.restoreAllMocks();
  });

  it('shows digital purchases on iOS and Android by default (sold with IAP); web always keeps them', () => {
    expect(resolveDigitalPurchasesEnabled('ios', {})).toBe(true);
    expect(resolveDigitalPurchasesEnabled('android', {})).toBe(true);
    expect(resolveDigitalPurchasesEnabled('web', {})).toBe(true);
    expect(resolveDigitalPurchasesEnabled('web', { shared: 'false' })).toBe(true);
  });

  it('kill switch: false hides; per-platform overrides beat the shared flag; junk falls back to visible', () => {
    expect(resolveDigitalPurchasesEnabled('ios', { shared: 'false' })).toBe(false);
    expect(resolveDigitalPurchasesEnabled('android', { shared: 'false' })).toBe(false);
    expect(resolveDigitalPurchasesEnabled('ios', { shared: 'true', ios: 'false' })).toBe(false);
    expect(resolveDigitalPurchasesEnabled('android', { shared: 'false', android: '1' })).toBe(true);
    expect(resolveDigitalPurchasesEnabled('ios', { ios: 'maybe' })).toBe(true);
    expect(resolveDigitalPurchasesEnabled('ios', { ios: ' NO ' })).toBe(false);
  });

  it('native builds bill digital services through the store, the web through the gateway', () => {
    expect(usesStoreBilling('ios')).toBe(true);
    expect(usesStoreBilling('android')).toBe(true);
    expect(usesStoreBilling('web')).toBe(false);
    for (const c of ['subscription', 'boost', 'promotion']) expect(isDigitalPaymentContext(c)).toBe(true);
    for (const c of ['listing_fee', 'commission', 'generic', undefined]) expect(isDigitalPaymentContext(c)).toBe(false);
  });

  it('reads the EXPO_PUBLIC_* env at call time via Platform.OS', () => {
    expect(withPlatform('ios', digitalPurchasesEnabled)).toBe(true);
    process.env.EXPO_PUBLIC_STORE_DIGITAL_PURCHASES_IOS = 'false';
    expect(withPlatform('ios', digitalPurchasesEnabled)).toBe(false);
    expect(withPlatform('android', digitalPurchasesEnabled)).toBe(true);
    expect(withPlatform('web', digitalPurchasesEnabled)).toBe(true);
  });

  it('keeps the literal env names so Expo can inline them', () => {
    const lib = src('lib/storePurchases.ts');
    for (const k of ENV_KEYS) expect(lib).toContain(`process.env.${k}`);
  });

  it('matches every digital-purchase route (deep links included)', () => {
    for (const p of ['/subscription', '/verification', '/promote', '/promote/', '/promote?x=1', '/listing/abc/promote']) {
      expect(isDigitalPurchaseRoute(p)).toBe(true);
    }
    for (const p of ['/listing/abc', '/payment', '/settings/payments', '/(tabs)/market', '/promoted']) {
      expect(isDigitalPurchaseRoute(p)).toBe(false);
    }
  });

  it('kill switch forces boost flags off but keeps listing fees (physical goods)', () => {
    const off = applyStorePurchasePolicy(DEFAULT_PAID_SERVICE_FLAGS, false);
    expect(off).toEqual({
      promotionEnabled: false,
      pinEnabled: false,
      featureEnabled: false,
      listingFeesEnabled: true,
    });
    expect(hasAnyBoostService(off)).toBe(false);
    expect(applyStorePurchasePolicy(DEFAULT_PAID_SERVICE_FLAGS, true)).toEqual(DEFAULT_PAID_SERVICE_FLAGS);
    expect(withPlatform('ios', getCachedPaidServiceFlags).promotionEnabled).toBe(true);
    process.env.EXPO_PUBLIC_STORE_DIGITAL_PURCHASES = 'false';
    expect(withPlatform('ios', getCachedPaidServiceFlags).promotionEnabled).toBe(false);
    expect(withPlatform('web', getCachedPaidServiceFlags).promotionEnabled).toBe(true);
  });

  it('applies the policy to fetched flags too', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        success: true,
        data: { flags: { promotionEnabled: true, pinEnabled: true, featureEnabled: true, listingFeesEnabled: true } },
      }),
    })) as unknown as typeof fetch;
    const prev = Platform.OS;
    (Platform as { OS: string }).OS = 'ios';
    process.env.EXPO_PUBLIC_STORE_DIGITAL_PURCHASES = 'false';
    try {
      const flags = await fetchPaidServiceFlags({ force: true });
      expect(hasAnyBoostService(flags)).toBe(false);
      expect(flags.listingFeesEnabled).toBe(true);
    } finally {
      (Platform as { OS: string }).OS = prev;
    }
  });

  it('drops subscription / promote menu rows and empty groups', () => {
    const groups = [
      { key: 'sub', rows: [{ key: 's', route: '/verification' }] },
      { key: 'mine', rows: [{ key: 'p', route: '/promote' }, { key: 'f', route: '/settings/payments' }, { key: 'x' }] },
    ];
    expect(withoutDigitalPurchaseRows(groups, true)).toBe(groups);
    const out = withoutDigitalPurchaseRows(groups, false);
    expect(out.map((g) => g.key)).toEqual(['mine']);
    expect(out[0].rows.map((r) => r.key)).toEqual(['f', 'x']);
  });

  it('hides the «تعزيز سرح» explore card when the kill switch is off', () => {
    expect(withPlatform('ios', () => resolveExploreCard({ destination: 'promote' }))).not.toBeNull();
    process.env.EXPO_PUBLIC_STORE_DIGITAL_PURCHASES = 'false';
    expect(withPlatform('web', () => resolveExploreCard({ destination: 'promote' }))).not.toBeNull();
    expect(withPlatform('ios', () => resolveExploreCard({ destination: 'promote' }))).toBeNull();
    expect(withPlatform('ios', () => resolveExploreCard({ destination: 'news' }))).not.toBeNull();
  });

  it('subscription notifications do not open a paywall when the kill switch is off', () => {
    process.env.EXPO_PUBLIC_STORE_DIGITAL_PURCHASES = 'false';
    const push = jest.fn();
    const router = { push, replace: jest.fn(), back: jest.fn() };
    const handled = withPlatform('ios', () =>
      handleNotificationNavigation({ type: 'subscription_renew' } as never, { router } as never),
    );
    expect(handled).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('every purchase screen renders «غير متاحة حالياً» when the kill switch is off', () => {
    expect(DIGITAL_PURCHASES_UNAVAILABLE_TITLE_AR).toBe('غير متاحة حالياً');
    for (const file of ['app/promote.tsx', 'app/listing/[id]/promote.tsx', 'app/verification.tsx', 'app/subscription.tsx']) {
      const text = src(file);
      expect(text).toContain('if (!digitalPurchasesEnabled()) return <DigitalPurchasesUnavailable');
      expect(text.match(/export default function/g)).toHaveLength(1);
    }
    const screen = src('components/feature/DigitalPurchasesUnavailable.tsx');
    expect(screen).toContain('DIGITAL_PURCHASES_UNAVAILABLE_TITLE_AR');
  });

  it('gates the sidebar, profile-views CTA, councils plans and settings rows', () => {
    expect(src('components/feature/AppSidebar.tsx')).toContain(
      'ALL_PRIMARY_ITEMS.filter((item) => !isDigitalPurchaseRoute(item.route))',
    );
    expect(src('app/profile/views.tsx')).toContain('digitalPurchasesEnabled() ? (');
    expect(src('app/councils/create.tsx')).toContain('if (!digitalPurchasesEnabled()) return;');
    expect(src('lib/settingsRows.ts')).toContain('return withoutDigitalPurchaseRows<SettingsRow, SettingsGroup>([');
  });

  it('EAS store profiles ship with digital purchases ON (kill switch = "false" to hide)', () => {
    const eas = JSON.parse(src('eas.json'));
    for (const profile of ['development', 'preview', 'production']) {
      expect(eas.build[profile].env.EXPO_PUBLIC_STORE_DIGITAL_PURCHASES).toBe('true');
    }
  });
});
