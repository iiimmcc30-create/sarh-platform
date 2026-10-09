// Apple In-App Purchase / Google Play Billing for Sarh's digital services
// (verification subscriptions, boosts, promotion) in the native apps.
//
// Library: expo-iap — the Expo module of the react-native-iap / OpenIAP project
// (free, MIT, same maintainer and API; react-native-iap v16 itself does not
// support Expo dev-client builds). No RevenueCat or any paid third party.
//
// Flow: requestPurchase → purchaseUpdatedListener → POST
// /api/store-purchases/verify (server verifies with Apple / Google and grants
// the entitlement) → finishTransaction ONLY after the server confirmed.
// Unfinished transactions are re-delivered by the store and retried by
// startStoreTransactionObserver (app start) — the server is idempotent.
// Needs a development / EAS build (not Expo Go). The website never loads this.
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import { STORE_PRODUCTS, findStoreProduct, type StoreProduct } from '@/lib/storeProducts';

type ExpoIap = typeof import('expo-iap');
type Purchase = import('expo-iap').Purchase;
type PurchaseError = import('expo-iap').PurchaseError;

export const ANDROID_PACKAGE = 'com.sarh.app';
const CONTEXT_KEY = 'sarh.iap.context.v1';

let iapModule: ExpoIap | null | undefined;

/** expo-iap, or null on web / Expo Go / when the native module is missing. */
export function loadIap(): ExpoIap | null {
  if (iapModule !== undefined) return iapModule;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return (iapModule = null);
  if (Constants.executionEnvironment === 'storeClient') return (iapModule = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    iapModule = require('expo-iap') as ExpoIap;
  } catch {
    iapModule = null;
  }
  return iapModule;
}

/** Test hook. */
export function __setIapModuleForTests(mod: ExpoIap | null | undefined) {
  iapModule = mod;
  connection = null;
  activeFlow = null;
  priceCache.clear();
}

export function storeName(os: string = Platform.OS): string {
  return os === 'ios' ? 'App Store' : 'Google Play';
}

let connection: Promise<boolean> | null = null;

async function ensureConnection(iap: ExpoIap): Promise<boolean> {
  if (!connection) {
    connection = iap
      .initConnection()
      .then((ok) => ok !== false)
      .catch(() => {
        connection = null;
        return false;
      });
  }
  return connection;
}

// ── Prices ────────────────────────────────────────────────────────────────

export type StorePrice = {
  productId: string;
  /** Localized price from the store, e.g. "29.99 ر.س" / "$7.99". */
  displayPrice: string;
  currency: string;
  price: number | null;
  /** Android subscriptions: offer token of the monthly base plan. */
  offerToken?: string | null;
};

const priceCache = new Map<string, StorePrice>();

type FetchedProduct = {
  id: string;
  displayPrice: string;
  currency: string;
  price?: number | null;
  subscriptionOffers?: {
    basePlanIdAndroid?: string | null;
    offerTokenAndroid?: string | null;
    id?: string;
  }[] | null;
};

function toStorePrice(p: FetchedProduct): StorePrice {
  const product = findStoreProduct(p.id);
  const offers = p.subscriptionOffers ?? [];
  const offer =
    offers.find((o) => o.basePlanIdAndroid === product?.androidBasePlanId && o.offerTokenAndroid) ??
    offers.find((o) => o.offerTokenAndroid);
  return {
    productId: p.id,
    displayPrice: p.displayPrice,
    currency: p.currency,
    price: typeof p.price === 'number' ? p.price : null,
    offerToken: offer?.offerTokenAndroid ?? null,
  };
}

/** Store-localized prices for the given product IDs (missing IDs are omitted). */
export async function fetchStorePrices(
  productIds: string[] = STORE_PRODUCTS.map((p) => p.productId),
): Promise<Record<string, StorePrice>> {
  const out: Record<string, StorePrice> = {};
  const iap = loadIap();
  if (!iap) return out;
  const missing = productIds.filter((id) => !priceCache.has(id));
  if (missing.length > 0 && (await ensureConnection(iap))) {
    const subs = missing.filter((id) => findStoreProduct(id)?.storeType === 'subs');
    const inApp = missing.filter((id) => findStoreProduct(id)?.storeType === 'in-app');
    const batches: [string[], 'subs' | 'in-app'][] = [
      [subs, 'subs'],
      [inApp, 'in-app'],
    ];
    for (const [skus, type] of batches) {
      if (skus.length === 0) continue;
      try {
        const products = ((await iap.fetchProducts({ skus, type })) ?? []) as FetchedProduct[];
        for (const p of products) priceCache.set(p.id, toStorePrice(p));
      } catch {
        // Store unavailable / products not approved yet: UI shows a placeholder.
      }
    }
  }
  for (const id of productIds) {
    const hit = priceCache.get(id);
    if (hit) out[id] = hit;
  }
  return out;
}

// ── Server verification ───────────────────────────────────────────────────

export type ServerVerifyStatus =
  | 'granted'
  | 'already_granted'
  | 'processing'
  | 'pending'
  | 'expired'
  | 'revoked';

export type ServerVerifyResult =
  | { ok: true; status: ServerVerifyStatus }
  | { ok: false; httpStatus: number; code?: string; message: string };

export function verifyPayloadFor(purchase: Purchase, listingId?: string | null) {
  const p = purchase as Purchase & { transactionId?: string | null };
  return {
    platform: Platform.OS === 'ios' ? ('app_store' as const) : ('google_play' as const),
    productId: purchase.productId,
    // iOS: StoreKit 2 JWS; Android: Play purchase token.
    purchaseToken: purchase.purchaseToken ?? undefined,
    transactionId: Platform.OS === 'ios' ? (p.transactionId ?? purchase.id) : undefined,
    listingId: listingId ?? undefined,
  };
}

export async function verifyWithServer(
  purchase: Purchase,
  listingId?: string | null,
): Promise<ServerVerifyResult> {
  try {
    const res = await authFetch(`${API_BASE}/api/store-purchases/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(verifyPayloadFor(purchase, listingId)),
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { status?: ServerVerifyStatus };
      error?: string;
      messageAr?: string;
    };
    if (res.ok && json.success && json.data?.status) {
      return { ok: true, status: json.data.status };
    }
    return {
      ok: false,
      httpStatus: res.status,
      code: json.error,
      message: json.messageAr ?? 'تعذّر تأكيد عملية الشراء',
    };
  } catch {
    return { ok: false, httpStatus: 0, message: 'تعذّر الاتصال بالخادم لتأكيد الشراء' };
  }
}

/** finish/acknowledge is allowed only once the server confirmed the grant. */
export function shouldFinish(result: ServerVerifyResult): boolean {
  if (!result.ok) return false;
  return (
    result.status === 'granted' ||
    result.status === 'already_granted' ||
    result.status === 'expired' ||
    result.status === 'revoked'
  );
}

// ── Listing context for consumables (survives app restarts) ──────────────

type PendingContext = Record<string, { listingId: string; at: number }>;

async function readContexts(): Promise<PendingContext> {
  try {
    const raw = await AsyncStorage.getItem(CONTEXT_KEY);
    return raw ? (JSON.parse(raw) as PendingContext) : {};
  } catch {
    return {};
  }
}

async function writeContext(productId: string, listingId: string | null) {
  const all = await readContexts();
  if (listingId) all[productId] = { listingId, at: Date.now() };
  else delete all[productId];
  await AsyncStorage.setItem(CONTEXT_KEY, JSON.stringify(all)).catch(() => undefined);
}

async function contextListingId(productId: string): Promise<string | null> {
  return (await readContexts())[productId]?.listingId ?? null;
}

// ── Purchase ──────────────────────────────────────────────────────────────

export type StorePurchaseOutcome =
  | { kind: 'granted' }
  | { kind: 'pending'; message: string }
  | { kind: 'cancelled' }
  | { kind: 'already_owned'; message: string }
  | { kind: 'unavailable'; message: string }
  | { kind: 'verify_failed'; message: string }
  | { kind: 'error'; message: string };

export const IAP_MESSAGES_AR = {
  unavailable: 'الشراء داخل التطبيق غير متاح على هذا الجهاز حالياً.',
  pending:
    'عملية الدفع بانتظار الموافقة (مثل «اطلب الشراء» أو الدفع النقدي). ستُفعَّل الخدمة تلقائياً فور اكتمالها.',
  alreadyOwned: 'أنت مشترك بالفعل في هذه الباقة. استخدم «استعادة المشتريات» إن لم تظهر لديك.',
  verifyFailed:
    'تم الدفع لدى المتجر لكن تعذّر تأكيده الآن. لا تقلق: سنعيد المحاولة تلقائياً ولن تُخصم مرتين.',
  generic: 'تعذّر إتمام الشراء. حاول مرة أخرى.',
} as const;

/** Maps a store error to an outcome (codes from expo-iap ErrorCode). */
export function outcomeForStoreError(
  error: { code?: unknown; message?: string } | null | undefined,
): StorePurchaseOutcome {
  const code = String(error?.code ?? '');
  if (code === 'user-cancelled') return { kind: 'cancelled' };
  if (code === 'pending' || code === 'deferred-payment') {
    return { kind: 'pending', message: IAP_MESSAGES_AR.pending };
  }
  if (code === 'already-owned') return { kind: 'already_owned', message: IAP_MESSAGES_AR.alreadyOwned };
  if (code === 'item-unavailable' || code === 'sku-not-found' || code === 'billing-unavailable' || code === 'iap-not-available') {
    return { kind: 'unavailable', message: IAP_MESSAGES_AR.unavailable };
  }
  if (code === 'network-error' || code === 'service-error' || code === 'remote-error') {
    return { kind: 'error', message: 'تعذّر الاتصال بالمتجر. تحقق من الاتصال وحاول مرة أخرى.' };
  }
  return { kind: 'error', message: IAP_MESSAGES_AR.generic };
}

/** Maps the server answer to the purchase outcome. */
export function outcomeForVerify(result: ServerVerifyResult): StorePurchaseOutcome {
  if (!result.ok) {
    if (result.httpStatus === 0 || result.httpStatus >= 500) {
      return { kind: 'verify_failed', message: IAP_MESSAGES_AR.verifyFailed };
    }
    return { kind: 'error', message: result.message };
  }
  if (result.status === 'granted' || result.status === 'already_granted') return { kind: 'granted' };
  if (result.status === 'pending' || result.status === 'processing') {
    return { kind: 'pending', message: IAP_MESSAGES_AR.pending };
  }
  return { kind: 'error', message: 'انتهت صلاحية عملية الشراء أو تم استردادها.' };
}

let activeFlow: string | null = null;

async function finishIfConfirmed(
  iap: ExpoIap,
  purchase: Purchase,
  result: ServerVerifyResult,
): Promise<void> {
  if (!shouldFinish(result)) return;
  const product = findStoreProduct(purchase.productId);
  try {
    await iap.finishTransaction({ purchase, isConsumable: product?.storeType === 'in-app' });
  } catch {
    // Re-delivered by the store and re-verified (idempotent) on next launch.
  }
  await writeContext(purchase.productId, null);
}

async function processPurchase(
  iap: ExpoIap,
  purchase: Purchase,
  listingId: string | null,
): Promise<StorePurchaseOutcome> {
  if (purchase.purchaseState === 'pending') {
    return { kind: 'pending', message: IAP_MESSAGES_AR.pending };
  }
  const ctxListing = listingId ?? (await contextListingId(purchase.productId));
  const result = await verifyWithServer(purchase, ctxListing);
  await finishIfConfirmed(iap, purchase, result);
  return outcomeForVerify(result);
}

export type PurchaseRequest = {
  productId: string;
  /** Sarh user id (UUID): bound to the store transaction (appAccountToken / obfuscatedAccountId). */
  userId: string;
  /** Boosts / promotion: the listing to apply the service to. */
  listingId?: string | null;
  /** Android tier change: the currently owned subscription. */
  replace?: { oldProductId: string; purchaseToken: string } | null;
};

export function buildRequestProps(req: PurchaseRequest, product: StoreProduct, price?: StorePrice) {
  if (product.storeType === 'subs') {
    return {
      type: 'subs' as const,
      request: {
        apple: { sku: product.productId, appAccountToken: req.userId },
        google: {
          skus: [product.productId],
          obfuscatedAccountId: req.userId,
          subscriptionOffers: price?.offerToken
            ? [{ sku: product.productId, offerToken: price.offerToken }]
            : undefined,
          ...(req.replace
            ? {
                purchaseToken: req.replace.purchaseToken,
                subscriptionProductReplacementParams: {
                  oldProductId: req.replace.oldProductId,
                  replacementMode: 'with-time-proration' as const,
                },
              }
            : {}),
        },
      },
    };
  }
  return {
    type: 'in-app' as const,
    request: {
      apple: { sku: product.productId, appAccountToken: req.userId, quantity: 1 },
      google: { skus: [product.productId], obfuscatedAccountId: req.userId },
    },
  };
}

/**
 * Buys one product with the store, verifies it on the server and finishes the
 * transaction only after the server granted it.
 */
export async function purchaseStoreProduct(req: PurchaseRequest): Promise<StorePurchaseOutcome> {
  const iap = loadIap();
  const product = findStoreProduct(req.productId);
  if (!iap || !product) return { kind: 'unavailable', message: IAP_MESSAGES_AR.unavailable };
  if (!(await ensureConnection(iap))) return { kind: 'unavailable', message: IAP_MESSAGES_AR.unavailable };
  if (activeFlow) return { kind: 'error', message: 'عملية شراء أخرى قيد التنفيذ.' };

  const prices = await fetchStorePrices([product.productId]);
  const price = prices[product.productId];
  if (!price) return { kind: 'unavailable', message: IAP_MESSAGES_AR.unavailable };
  if (product.storeType === 'subs' && Platform.OS === 'android' && !price.offerToken) {
    return { kind: 'unavailable', message: IAP_MESSAGES_AR.unavailable };
  }

  activeFlow = product.productId;
  await writeContext(product.productId, req.listingId ?? null);

  return new Promise<StorePurchaseOutcome>((resolve) => {
    let settled = false;
    const subs: { remove: () => void }[] = [];
    const done = (outcome: StorePurchaseOutcome) => {
      if (settled) return;
      settled = true;
      activeFlow = null;
      subs.forEach((s) => s.remove());
      resolve(outcome);
    };
    subs.push(
      iap.purchaseUpdatedListener((purchase) => {
        if (purchase.productId !== product.productId) return;
        void processPurchase(iap, purchase, req.listingId ?? null).then(done, () =>
          done({ kind: 'verify_failed', message: IAP_MESSAGES_AR.verifyFailed }),
        );
      }),
    );
    subs.push(
      iap.purchaseErrorListener((error) => {
        if (error.productId && error.productId !== product.productId) return;
        done(outcomeForStoreError(error));
      }),
    );
    iap
      .requestPurchase(buildRequestProps(req, product, price) as Parameters<ExpoIap['requestPurchase']>[0])
      .catch((err: unknown) => done(outcomeForStoreError(err as PurchaseError | null)));
  });
}

// ── Restore / observer / management ──────────────────────────────────────

/** Subscriptions currently owned in the store account (catalog products only). */
export async function getOwnedStoreSubscriptions(): Promise<Purchase[]> {
  const iap = loadIap();
  if (!iap || !(await ensureConnection(iap))) return [];
  try {
    const purchases = (await iap.getAvailablePurchases()) ?? [];
    return purchases.filter((p) => findStoreProduct(p.productId)?.storeType === 'subs');
  } catch {
    return [];
  }
}

export type RestoreResult = { restored: number; failed: number; available: boolean };

/** «استعادة المشتريات»: re-sends owned subscriptions to the server. */
export async function restoreStorePurchases(): Promise<RestoreResult> {
  const iap = loadIap();
  if (!iap || !(await ensureConnection(iap))) return { restored: 0, failed: 0, available: false };
  if (Platform.OS === 'ios') {
    await iap.restorePurchases().catch(() => undefined);
  }
  const owned = await getOwnedStoreSubscriptions();
  let restored = 0;
  let failed = 0;
  for (const purchase of owned) {
    const result = await verifyWithServer(purchase, null);
    await finishIfConfirmed(iap, purchase, result);
    if (result.ok && (result.status === 'granted' || result.status === 'already_granted')) restored++;
    else failed++;
  }
  return { restored, failed, available: true };
}

/**
 * App-level observer: verifies + finishes transactions the store re-delivers
 * (interrupted purchases, Ask to Buy approvals, renewals while closed).
 * Returns a cleanup function. Call once while signed in.
 */
export function startStoreTransactionObserver(): () => void {
  const iap = loadIap();
  if (!iap) return () => undefined;
  let stopped = false;
  const sub = iap.purchaseUpdatedListener((purchase) => {
    if (stopped || activeFlow === purchase.productId) return;
    if (!findStoreProduct(purchase.productId)) return;
    void processPurchase(iap, purchase, null).catch(() => undefined);
  });
  void (async () => {
    if (!(await ensureConnection(iap)) || stopped || Platform.OS !== 'android') return;
    // Android: unacknowledged / unconsumed purchases (iOS re-emits them itself).
    try {
      const purchases = (await iap.getAvailablePurchases()) ?? [];
      for (const p of purchases) {
        const ack = (p as Purchase & { isAcknowledgedAndroid?: boolean | null }).isAcknowledgedAndroid;
        if (stopped || ack === true || !findStoreProduct(p.productId)) continue;
        await processPurchase(iap, p, null).catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
  })();
  return () => {
    stopped = true;
    sub.remove();
  };
}

/** Opens the store's subscription management (cancel / change plan). */
export async function openStoreSubscriptionManagement(productId?: string): Promise<void> {
  const iap = loadIap();
  if (iap) {
    try {
      await iap.deepLinkToSubscriptions({
        skuAndroid: productId ?? null,
        packageNameAndroid: ANDROID_PACKAGE,
      });
      return;
    } catch {
      /* fall back to the web URL */
    }
  }
  const url =
    Platform.OS === 'ios'
      ? 'https://apps.apple.com/account/subscriptions'
      : `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}${
          productId ? `&sku=${encodeURIComponent(productId)}` : ''
        }`;
  await Linking.openURL(url).catch(() => undefined);
}
