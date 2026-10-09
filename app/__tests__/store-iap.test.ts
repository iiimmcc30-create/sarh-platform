import { readFileSync } from 'fs';
import path from 'path';
import { Platform } from 'react-native';
import { STORE_PRODUCTS, boostProductFor, subscriptionProductForTier } from '@/lib/storeProducts';
import { promoteGoalProductId, storeCtaLabel, storePlanViews, STORE_LISTING_PRODUCT_IDS } from '@/lib/storePricing';
import {
  __setIapModuleForTests,
  buildRequestProps,
  outcomeForStoreError,
  outcomeForVerify,
  purchaseStoreProduct,
  shouldFinish,
  verifyPayloadFor,
} from '@/services/iap';
import { authFetch } from '@/services/authFetch';

jest.mock('expo-constants', () => ({ __esModule: true, default: { executionEnvironment: 'standalone' } }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
    },
  };
});
jest.mock('@/services/api', () => ({ API_BASE: 'https://api.test' }));
jest.mock('@/services/authFetch', () => ({ authFetch: jest.fn() }));

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const USER = '11111111-2222-4333-8444-555555555555';
const LISTING = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function withPlatform<T>(os: string, fn: () => T): T {
  const prev = Platform.OS;
  (Platform as { OS: string }).OS = os;
  try {
    return fn();
  } finally {
    (Platform as { OS: string }).OS = prev;
  }
}

function serverReplies(status: number, body: unknown) {
  (authFetch as jest.Mock).mockResolvedValue({ ok: status < 400, status, json: async () => body });
}

type Listener = (arg: unknown) => void;
function fakeIap() {
  const updated: Listener[] = [];
  const errors: Listener[] = [];
  const iap = {
    initConnection: jest.fn(async () => true),
    fetchProducts: jest.fn(async ({ skus }: { skus: string[] }) =>
      skus.map((id) => ({
        id,
        displayPrice: `${id.length} SAR`,
        currency: 'SAR',
        price: id.length,
        subscriptionOffers: [{ id: 'o', basePlanIdAndroid: 'monthly', offerTokenAndroid: `tok-${id}` }],
      })),
    ),
    purchaseUpdatedListener: jest.fn((l: Listener) => {
      updated.push(l);
      return { remove: () => updated.splice(updated.indexOf(l), 1) };
    }),
    purchaseErrorListener: jest.fn((l: Listener) => {
      errors.push(l);
      return { remove: () => errors.splice(errors.indexOf(l), 1) };
    }),
    requestPurchase: jest.fn(async () => null),
    finishTransaction: jest.fn(async () => undefined),
    getAvailablePurchases: jest.fn(async () => []),
    restorePurchases: jest.fn(async () => undefined),
    deepLinkToSubscriptions: jest.fn(async () => undefined),
  };
  return {
    iap,
    emitPurchase: (p: Record<string, unknown>) => updated.forEach((l) => l(p)),
    emitError: (e: Record<string, unknown>) => errors.forEach((l) => l(e)),
  };
}

describe('store product IDs', () => {
  it('app catalog mirrors the backend catalog exactly (IDs, kinds, prices)', () => {
    const backend = src('../backend-nest/src/store-purchases/store-products.ts');
    const ids = [...backend.matchAll(/productId: '([^']+)'/g)].map((m) => m[1]);
    const prices = [...backend.matchAll(/referencePriceSar: (\d+)/g)].map((m) => Number(m[1]));
    expect(STORE_PRODUCTS.map((p) => p.productId)).toEqual(ids);
    expect(STORE_PRODUCTS.map((p) => p.referencePriceSar)).toEqual(prices);
    const appBody = src('lib/storeProducts.ts');
    expect(appBody.slice(appBody.indexOf('export type StoreProductKind'))).toBe(
      backend.slice(backend.indexOf('export type StoreProductKind')),
    );
  });

  it('maps every promote option and verification tier to a product', () => {
    expect(subscriptionProductForTier('gold').productId).toBe('sa.sarh.gold.monthly');
    expect(promoteGoalProductId('featured', 24)).toBe('sa.sarh.boost.featured.1d');
    expect(promoteGoalProductId('pinned', 72)).toBe('sa.sarh.boost.pinned.3d');
    expect(promoteGoalProductId('visibility', 48)).toBe('sa.sarh.boost.promote.2d');
    expect(promoteGoalProductId('both', 72)).toBe('sa.sarh.boost.both.3d');
    expect(promoteGoalProductId('featured', 48)).toBeNull();
    expect(STORE_LISTING_PRODUCT_IDS).toHaveLength(8);
    expect(boostProductFor('both', 24)?.referencePriceSar).toBe(21);
  });
});

describe('store price presentation', () => {
  it('shows the store-localized price and drops catalog per-day / saving maths', () => {
    const plans = [
      { durationHours: 24, durationDays: 1, amount: 9, labelAr: 'يوم', priceLabel: '9 ر.س', perDayLabel: null, savingLabel: null, bestValue: false },
      { durationHours: 72, durationDays: 3, amount: 25, labelAr: '٣ أيام', priceLabel: '25 ر.س', perDayLabel: '≈ 8.3', savingLabel: 'وفّر 2 ر.س', bestValue: true },
    ];
    const out = storePlanViews(plans, 'featured', {
      'sa.sarh.boost.featured.3d': { productId: 'x', displayPrice: '24.99 ر.س', currency: 'SAR', price: 24.99 },
    });
    expect(out[0].priceLabel).toBe('—');
    expect(out[1]).toMatchObject({ priceLabel: '24.99 ر.س', perDayLabel: null, savingLabel: null, bestValue: false });
    expect(storeCtaLabel('$6.99')).toBe('عزّز الآن · $6.99');
    expect(storeCtaLabel(null)).toBe('عزّز الآن');
  });
});

describe('IAP outcomes', () => {
  it('maps store errors (cancelled / pending / owned / unavailable)', () => {
    expect(outcomeForStoreError({ code: 'user-cancelled' }).kind).toBe('cancelled');
    expect(outcomeForStoreError({ code: 'pending' }).kind).toBe('pending');
    expect(outcomeForStoreError({ code: 'already-owned' }).kind).toBe('already_owned');
    expect(outcomeForStoreError({ code: 'item-unavailable' }).kind).toBe('unavailable');
    expect(outcomeForStoreError({ code: 'network-error' }).kind).toBe('error');
    expect(outcomeForStoreError(null).kind).toBe('error');
  });

  it('finishes / acknowledges only after the server confirmed', () => {
    expect(shouldFinish({ ok: true, status: 'granted' })).toBe(true);
    expect(shouldFinish({ ok: true, status: 'already_granted' })).toBe(true);
    expect(shouldFinish({ ok: true, status: 'pending' })).toBe(false);
    expect(shouldFinish({ ok: true, status: 'processing' })).toBe(false);
    expect(shouldFinish({ ok: false, httpStatus: 500, message: 'x' })).toBe(false);
    expect(shouldFinish({ ok: false, httpStatus: 403, message: 'x' })).toBe(false);
    expect(outcomeForVerify({ ok: false, httpStatus: 0, message: 'x' }).kind).toBe('verify_failed');
    expect(outcomeForVerify({ ok: false, httpStatus: 403, message: 'حساب آخر' })).toEqual({
      kind: 'error',
      message: 'حساب آخر',
    });
  });

  it('binds the Sarh user to the transaction and passes the Android base-plan offer', () => {
    const subs = buildRequestProps(
      { productId: 'sa.sarh.gold.monthly', userId: USER },
      subscriptionProductForTier('gold'),
      { productId: 'sa.sarh.gold.monthly', displayPrice: '', currency: 'SAR', price: 1, offerToken: 'OT' },
    );
    expect(subs).toMatchObject({
      type: 'subs',
      request: {
        apple: { sku: 'sa.sarh.gold.monthly', appAccountToken: USER },
        google: {
          skus: ['sa.sarh.gold.monthly'],
          obfuscatedAccountId: USER,
          subscriptionOffers: [{ sku: 'sa.sarh.gold.monthly', offerToken: 'OT' }],
        },
      },
    });
    const upgrade = buildRequestProps(
      { productId: 'sa.sarh.gold.monthly', userId: USER, replace: { oldProductId: 'sa.sarh.verification.blue.monthly', purchaseToken: 'old' } },
      subscriptionProductForTier('gold'),
    );
    expect(upgrade.request.google).toMatchObject({
      purchaseToken: 'old',
      subscriptionProductReplacementParams: { oldProductId: 'sa.sarh.verification.blue.monthly' },
    });
    const boost = buildRequestProps({ productId: 'sa.sarh.boost.pinned.1d', userId: USER }, boostProductFor('pinned', 24)!);
    expect(boost).toMatchObject({ type: 'in-app', request: { google: { obfuscatedAccountId: USER } } });
  });

  it('sends the StoreKit JWS on iOS and the Play token on Android', () => {
    const purchase = { productId: 'p', id: 'ios-1', transactionId: 'T1', purchaseToken: 'JWS' } as never;
    expect(withPlatform('ios', () => verifyPayloadFor(purchase, LISTING))).toEqual({
      platform: 'app_store',
      productId: 'p',
      purchaseToken: 'JWS',
      transactionId: 'T1',
      listingId: LISTING,
    });
    expect(withPlatform('android', () => verifyPayloadFor(purchase))).toMatchObject({
      platform: 'google_play',
      purchaseToken: 'JWS',
      transactionId: undefined,
    });
  });
});

describe('purchaseStoreProduct', () => {
  const prevOS = Platform.OS;
  beforeEach(() => {
    (Platform as { OS: string }).OS = 'ios';
    (authFetch as jest.Mock).mockReset();
  });
  afterEach(() => {
    (Platform as { OS: string }).OS = prevOS;
    __setIapModuleForTests(undefined);
  });

  async function flush() {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }

  it('verifies with the server, then finishes the consumable', async () => {
    const f = fakeIap();
    __setIapModuleForTests(f.iap as never);
    serverReplies(200, { success: true, data: { status: 'granted' } });
    const pending = purchaseStoreProduct({ productId: 'sa.sarh.boost.featured.1d', userId: USER, listingId: LISTING });
    await flush();
    expect(f.iap.requestPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'in-app', request: expect.objectContaining({ apple: expect.objectContaining({ appAccountToken: USER }) }) }),
    );
    expect(f.iap.finishTransaction).not.toHaveBeenCalled();
    const purchase = { productId: 'sa.sarh.boost.featured.1d', id: '1', transactionId: '1', purchaseToken: 'JWS', purchaseState: 'purchased' };
    f.emitPurchase(purchase);
    await expect(pending).resolves.toEqual({ kind: 'granted' });
    const body = JSON.parse((authFetch as jest.Mock).mock.calls[0][1].body);
    expect((authFetch as jest.Mock).mock.calls[0][0]).toBe('https://api.test/api/store-purchases/verify');
    expect(body).toMatchObject({ platform: 'app_store', productId: 'sa.sarh.boost.featured.1d', listingId: LISTING, purchaseToken: 'JWS' });
    expect(f.iap.finishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: true });
  });

  it('does not finish when the server could not confirm (retried later)', async () => {
    const f = fakeIap();
    __setIapModuleForTests(f.iap as never);
    serverReplies(502, { success: false });
    const pending = purchaseStoreProduct({ productId: 'sa.sarh.gold.monthly', userId: USER });
    await flush();
    f.emitPurchase({ productId: 'sa.sarh.gold.monthly', id: '2', purchaseToken: 'JWS', purchaseState: 'purchased' });
    await expect(pending).resolves.toMatchObject({ kind: 'verify_failed' });
    expect(f.iap.finishTransaction).not.toHaveBeenCalled();
  });

  it('pending purchases are neither verified nor finished; cancel is silent', async () => {
    const f = fakeIap();
    __setIapModuleForTests(f.iap as never);
    const pending = purchaseStoreProduct({ productId: 'sa.sarh.gold.monthly', userId: USER });
    await flush();
    f.emitPurchase({ productId: 'sa.sarh.gold.monthly', id: '3', purchaseState: 'pending' });
    await expect(pending).resolves.toMatchObject({ kind: 'pending' });
    expect(authFetch).not.toHaveBeenCalled();
    expect(f.iap.finishTransaction).not.toHaveBeenCalled();

    const cancelled = purchaseStoreProduct({ productId: 'sa.sarh.gold.monthly', userId: USER });
    await flush();
    f.emitError({ code: 'user-cancelled', message: 'x' });
    await expect(cancelled).resolves.toEqual({ kind: 'cancelled' });
  });

  it('is unavailable on the web and for unknown products', async () => {
    __setIapModuleForTests(undefined);
    (Platform as { OS: string }).OS = 'web';
    await expect(purchaseStoreProduct({ productId: 'sa.sarh.gold.monthly', userId: USER })).resolves.toMatchObject({
      kind: 'unavailable',
    });
    (Platform as { OS: string }).OS = 'ios';
    __setIapModuleForTests(fakeIap().iap as never);
    await expect(purchaseStoreProduct({ productId: 'nope', userId: USER })).resolves.toMatchObject({ kind: 'unavailable' });
  });
});

describe('native screens use IAP, never the external checkout', () => {
  it('verification: store price, restore purchases, auto-renew disclosure, terms + privacy, store management', () => {
    const v = src('app/verification.tsx');
    expect(v).toContain('purchaseStoreProduct(');
    expect(v).toContain('استعادة المشتريات');
    expect(v).toContain('ويتجدد تلقائياً كل شهر بنفس السعر');
    expect(v).toContain('قبل 24 ساعة على الأقل من نهاية الفترة الحالية');
    expect(v).toContain("'/info/terms'");
    expect(v).toContain("'/info/privacy'");
    expect(v).toContain('openStoreSubscriptionManagement(');
    expect(v).toContain("storePrices[storeProductId]?.displayPrice");
  });

  it('promote screen and boost sheet buy with the store and hide card logos / method picker', () => {
    const promote = src('app/listing/[id]/promote.tsx');
    expect(promote).toContain('purchaseStoreProduct({ productId: storeProductId, userId: user.id, listingId: id })');
    expect(promote).toContain('{storeBilling ? null : (');
    const sheet = src('components/listing/ListingBoostSheet.tsx');
    expect(sheet).toContain('purchaseStoreProduct({ productId, userId: user.id, listingId })');
    expect(sheet).toContain('{storeBilling ? null : (');
  });

  it('the gateway refuses digital contexts on native; /payment redirects to verification', () => {
    expect(src('services/payments.ts')).toContain('usesStoreBilling() && isDigitalPaymentContext(context)');
    expect(src('app/payment.tsx')).toContain("if (usesStoreBilling()) return <Redirect href={'/verification' as never} />;");
  });

  it('ships expo-iap (free OpenIAP module) with its config plugin and no paid SDK', () => {
    const pkg = JSON.parse(src('package.json'));
    expect(pkg.dependencies['expo-iap']).toBe('5.8.3');
    expect(pkg.dependencies['react-native-purchases']).toBeUndefined();
    const appJson = JSON.parse(src('app.json'));
    expect(appJson.expo.plugins).toContain('expo-iap');
    expect(appJson.expo.android.permissions).toContain('com.android.vending.BILLING');
  });
});
