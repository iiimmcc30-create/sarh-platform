import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  AppleJwsError,
  verifyAppleJws,
  type AppleJwsOptions,
} from './apple/apple-jws';
import { AppStoreServerApi } from './apple/app-store-server-api';
import {
  GooglePlayApi,
  type GoogleProductPurchase,
  type GoogleSubscriptionPurchaseV2,
} from './google/google-play-api';
import { findStoreProduct } from './store-products';
import {
  appleBundleId,
  readAppleIapConfig,
  readGooglePlayConfig,
} from './store-purchases.config';
import {
  StorePurchaseError,
  type VerifiedStorePurchase,
} from './store-purchases.types';

/** Decoded StoreKit 2 JWSTransactionDecodedPayload (fields we use). */
export type AppleTransactionPayload = {
  transactionId?: string;
  originalTransactionId?: string;
  bundleId?: string;
  productId?: string;
  purchaseDate?: number;
  expiresDate?: number;
  type?: string;
  appAccountToken?: string;
  environment?: string;
  revocationDate?: number;
  revocationReason?: number;
  price?: number;
  currency?: string;
  inAppOwnershipType?: string;
};

export type AppleRenewalPayload = {
  originalTransactionId?: string;
  autoRenewStatus?: number;
  autoRenewProductId?: string;
  productId?: string;
};

/** Injection token for test doubles of the JWS trust options. */
export const APPLE_JWS_OPTIONS = 'APPLE_JWS_OPTIONS';

function toDate(ms: number | string | null | undefined): Date | null {
  if (ms === null || ms === undefined || ms === '') return null;
  const n = typeof ms === 'string' ? Number(ms) : ms;
  if (Number.isFinite(n)) return new Date(n);
  const parsed = new Date(String(ms));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function tokenKey(token: string): string {
  return `token:${createHash('sha256').update(token).digest('hex').slice(0, 40)}`;
}

/**
 * Verifies purchases against Apple / Google and normalizes the result.
 * Apple: Apple-signed JWS verified offline against Apple Root CA G3; when the
 * App Store Server API key is configured the transaction is re-fetched from
 * Apple (authoritative, catches refunds). Google: Play Developer API.
 */
@Injectable()
export class StorePurchaseVerifierService {
  private appleApi: AppStoreServerApi | null | undefined;
  private googleApi: GooglePlayApi | undefined;

  constructor(
    @Optional()
    @Inject(APPLE_JWS_OPTIONS)
    private readonly jwsOptions?: AppleJwsOptions,
  ) {}

  private getAppleApi(): AppStoreServerApi | null {
    if (this.appleApi === undefined) {
      const config = readAppleIapConfig();
      this.appleApi = config ? new AppStoreServerApi(config) : null;
    }
    return this.appleApi;
  }

  getGoogleApi(): GooglePlayApi {
    if (!this.googleApi)
      this.googleApi = new GooglePlayApi(readGooglePlayConfig());
    return this.googleApi;
  }

  /** Verifies any Apple-signed JWS (transaction, renewal info, notification). */
  verifyAppleJws<T>(jws: string): T {
    try {
      return verifyAppleJws<T>(jws, this.jwsOptions ?? {});
    } catch (err) {
      if (err instanceof AppleJwsError) {
        throw new StorePurchaseError(
          400,
          'invalid_store_signature',
          'توقيع متجر Apple غير صالح',
        );
      }
      throw err;
    }
  }

  normalizeAppleTransaction(
    tx: AppleTransactionPayload,
    renewal?: AppleRenewalPayload | null,
  ): VerifiedStorePurchase {
    if (!tx.transactionId || !tx.productId) {
      throw new StorePurchaseError(
        400,
        'invalid_store_transaction',
        'بيانات عملية الشراء غير مكتملة',
      );
    }
    if (tx.bundleId !== appleBundleId()) {
      throw new StorePurchaseError(
        400,
        'bundle_mismatch',
        'عملية الشراء لا تخص تطبيق سَرح',
      );
    }
    const expiresAt = toDate(tx.expiresDate);
    const revoked = tx.revocationDate != null;
    const now = Date.now();
    const state: VerifiedStorePurchase['state'] = revoked
      ? 'revoked'
      : expiresAt && expiresAt.getTime() <= now
        ? 'expired'
        : 'purchased';
    return {
      platform: 'app_store',
      productId: tx.productId,
      transactionId: String(tx.transactionId),
      originalTransactionId: tx.originalTransactionId
        ? String(tx.originalTransactionId)
        : null,
      purchaseToken: null,
      state,
      accountToken: tx.appAccountToken
        ? tx.appAccountToken.toLowerCase()
        : null,
      environment: tx.environment ?? null,
      purchasedAt: toDate(tx.purchaseDate),
      expiresAt,
      autoRenew:
        renewal && typeof renewal.autoRenewStatus === 'number'
          ? renewal.autoRenewStatus === 1
          : tx.type === 'Auto-Renewable Subscription'
            ? true
            : null,
      storePrice:
        typeof tx.price === 'number' && tx.currency
          ? { amount: tx.price / 1000, currency: tx.currency }
          : null,
      raw: { ...tx, revocationDate: tx.revocationDate ?? null },
    };
  }

  async verifyApple(input: {
    signedTransaction?: string | null;
    transactionId?: string | null;
  }): Promise<VerifiedStorePurchase> {
    let payload: AppleTransactionPayload | null = null;
    if (input.signedTransaction) {
      payload = this.verifyAppleJws<AppleTransactionPayload>(
        input.signedTransaction,
      );
    }
    const txId = input.transactionId || payload?.transactionId;
    if (
      payload &&
      input.transactionId &&
      payload.transactionId !== input.transactionId
    ) {
      throw new StorePurchaseError(
        400,
        'transaction_mismatch',
        'رقم العملية لا يطابق بيانات المتجر',
      );
    }
    const api = this.getAppleApi();
    if (api && txId) {
      const fetched = await api.getSignedTransaction(String(txId));
      if (!fetched) {
        throw new StorePurchaseError(
          404,
          'store_transaction_not_found',
          'لم يتم العثور على عملية الشراء لدى Apple',
        );
      }
      payload = this.verifyAppleJws<AppleTransactionPayload>(
        fetched.signedTransactionInfo,
      );
    }
    if (!payload) {
      throw new StorePurchaseError(
        503,
        'store_not_configured',
        'التحقق من مشتريات Apple غير مُفعّل بعد',
      );
    }
    return this.normalizeAppleTransaction(payload);
  }

  normalizeGoogleSubscription(
    token: string,
    sub: GoogleSubscriptionPurchaseV2,
    expectedProductId?: string | null,
  ): VerifiedStorePurchase {
    const line =
      sub.lineItems?.find(
        (l) => !expectedProductId || l.productId === expectedProductId,
      ) ?? sub.lineItems?.[0];
    const productId = line?.productId;
    if (!productId) {
      throw new StorePurchaseError(
        400,
        'invalid_store_transaction',
        'بيانات الاشتراك غير مكتملة',
      );
    }
    const expiresAt = toDate(line?.expiryTime ?? null);
    const s = sub.subscriptionState;
    let state: VerifiedStorePurchase['state'];
    if (s === 'SUBSCRIPTION_STATE_PENDING') state = 'pending';
    else if (
      s === 'SUBSCRIPTION_STATE_ACTIVE' ||
      s === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' ||
      (s === 'SUBSCRIPTION_STATE_CANCELED' &&
        !!expiresAt &&
        expiresAt.getTime() > Date.now())
    ) {
      state = 'purchased';
    } else if (s === 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED')
      state = 'revoked';
    else state = 'expired';
    // Renewals carry a new orderId ("GPA.x..0", "..1"); the token stays the same.
    const transactionId = sub.latestOrderId || tokenKey(token);
    return {
      platform: 'google_play',
      productId,
      transactionId,
      originalTransactionId: tokenKey(token),
      purchaseToken: token,
      state,
      accountToken: sub.externalAccountIdentifiers?.obfuscatedExternalAccountId
        ? sub.externalAccountIdentifiers.obfuscatedExternalAccountId.toLowerCase()
        : null,
      environment: sub.testPurchase ? 'test' : 'production',
      purchasedAt: toDate(sub.startTime ?? null),
      expiresAt,
      autoRenew: line?.autoRenewingPlan?.autoRenewEnabled ?? null,
      storePrice: null,
      raw: sub as Record<string, unknown>,
    };
  }

  normalizeGoogleProduct(
    productId: string,
    token: string,
    p: GoogleProductPurchase,
  ): VerifiedStorePurchase {
    const state: VerifiedStorePurchase['state'] =
      p.purchaseState === 0
        ? 'purchased'
        : p.purchaseState === 2
          ? 'pending'
          : 'revoked';
    return {
      platform: 'google_play',
      productId,
      transactionId: p.orderId || tokenKey(token),
      originalTransactionId: null,
      purchaseToken: token,
      state,
      accountToken: p.obfuscatedExternalAccountId
        ? p.obfuscatedExternalAccountId.toLowerCase()
        : null,
      environment: p.purchaseType === 0 ? 'test' : 'production',
      purchasedAt: toDate(p.purchaseTimeMillis ?? null),
      expiresAt: null,
      autoRenew: null,
      storePrice: null,
      raw: p as Record<string, unknown>,
    };
  }

  async verifyGoogle(input: {
    productId: string;
    purchaseToken: string;
  }): Promise<VerifiedStorePurchase> {
    const api = this.getGoogleApi();
    if (!api.configured) {
      throw new StorePurchaseError(
        503,
        'store_not_configured',
        'التحقق من مشتريات Google Play غير مُفعّل بعد',
      );
    }
    const product = findStoreProduct(input.productId);
    try {
      if (product?.storeType === 'subs') {
        const sub = await api.getSubscriptionV2(input.purchaseToken);
        return this.normalizeGoogleSubscription(
          input.purchaseToken,
          sub,
          input.productId,
        );
      }
      const p = await api.getProductPurchase(
        input.productId,
        input.purchaseToken,
      );
      return this.normalizeGoogleProduct(
        input.productId,
        input.purchaseToken,
        p,
      );
    } catch (err: unknown) {
      if (err instanceof StorePurchaseError) throw err;
      const status =
        (err as { response?: { status?: number } })?.response?.status ??
        (err as { status?: number })?.status;
      if (status === 400 || status === 404 || status === 410) {
        throw new StorePurchaseError(
          404,
          'store_transaction_not_found',
          'لم يتم العثور على عملية الشراء لدى Google Play',
        );
      }
      throw err;
    }
  }
}
