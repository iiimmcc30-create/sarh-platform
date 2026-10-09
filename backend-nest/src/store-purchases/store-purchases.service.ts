import { Injectable } from '@nestjs/common';
import { LoggerService } from '../common/services/logger.service';
import { StoreEntitlementsService } from './store-entitlements.service';
import {
  StorePurchaseVerifierService,
  type AppleRenewalPayload,
  type AppleTransactionPayload,
} from './store-purchase-verifier.service';
import { STORE_PRODUCTS, findStoreProduct } from './store-products';
import { StorePurchasesRepository } from './store-purchases.repository';
import { readGooglePlayConfig, appleBundleId } from './store-purchases.config';
import {
  StorePurchaseError,
  type StorePlatformKey,
  type VerifiedStorePurchase,
  type VerifyOutcome,
} from './store-purchases.types';

export type VerifyRequest = {
  platform: StorePlatformKey;
  productId: string;
  /** iOS: StoreKit 2 JWS (purchase.purchaseToken); Android: purchase token. */
  purchaseToken?: string | null;
  transactionId?: string | null;
  listingId?: string | null;
};

type AppleNotificationPayload = {
  notificationType?: string;
  subtype?: string;
  notificationUUID?: string;
  data?: {
    bundleId?: string;
    environment?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
};

type GoogleRtdn = {
  packageName?: string;
  subscriptionNotification?: {
    notificationType?: number;
    purchaseToken?: string;
    subscriptionId?: string;
  };
  oneTimeProductNotification?: {
    notificationType?: number;
    purchaseToken?: string;
    sku?: string;
  };
  voidedPurchaseNotification?: {
    purchaseToken?: string;
    orderId?: string;
    productType?: number;
  };
  testNotification?: Record<string, unknown>;
};

/** Google RTDN subscription notification types. */
const G_SUB = {
  RECOVERED: 1,
  RENEWED: 2,
  CANCELED: 3,
  PURCHASED: 4,
  ON_HOLD: 5,
  IN_GRACE_PERIOD: 6,
  RESTARTED: 7,
  REVOKED: 12,
  EXPIRED: 13,
  PENDING_PURCHASE_CANCELED: 20,
} as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class StorePurchasesService {
  constructor(
    private readonly repo: StorePurchasesRepository,
    private readonly verifier: StorePurchaseVerifierService,
    private readonly entitlements: StoreEntitlementsService,
    private readonly logger: LoggerService,
  ) {}

  /** Public catalog for the app (IDs + reference SAR prices). */
  getCatalog() {
    return {
      products: STORE_PRODUCTS.map((p) => ({
        productId: p.productId,
        kind: p.kind,
        storeType: p.storeType,
        referencePriceSar: p.referencePriceSar,
        titleAr: p.titleAr,
        planSlug: p.planSlug ?? null,
        boostType: p.boostType ?? null,
        durationHours: p.durationHours ?? null,
      })),
    };
  }

  private async verifyWithStore(
    req: VerifyRequest,
  ): Promise<VerifiedStorePurchase> {
    if (req.platform === 'app_store') {
      return this.verifier.verifyApple({
        signedTransaction: req.purchaseToken,
        transactionId: req.transactionId,
      });
    }
    if (!req.purchaseToken) {
      throw new StorePurchaseError(
        400,
        'purchase_token_required',
        'بيانات عملية الشراء ناقصة',
      );
    }
    return this.verifier.verifyGoogle({
      productId: req.productId,
      purchaseToken: req.purchaseToken,
    });
  }

  /** POST /store-purchases/verify — called by the app before finishing a transaction. */
  async verifyFromClient(
    userId: string,
    req: VerifyRequest,
  ): Promise<VerifyOutcome> {
    const product = findStoreProduct(req.productId);
    if (!product) {
      throw new StorePurchaseError(400, 'unknown_product', 'منتج غير معروف');
    }
    const verified = await this.verifyWithStore(req);
    return this.processVerified(verified, {
      expectedUserId: userId,
      listingId: req.listingId ?? null,
      expectedProductId: product.productId,
    });
  }

  /**
   * Shared by client verification and webhooks. Idempotent per
   * (platform, transactionId): only the claimer grants; others get the state.
   */
  async processVerified(
    verified: VerifiedStorePurchase,
    opts: {
      expectedUserId?: string | null;
      listingId?: string | null;
      expectedProductId?: string | null;
      fallbackUserId?: string | null;
    },
  ): Promise<VerifyOutcome> {
    const product = findStoreProduct(verified.productId);
    if (!product) {
      throw new StorePurchaseError(400, 'unknown_product', 'منتج غير معروف');
    }
    if (
      opts.expectedProductId &&
      opts.expectedProductId !== verified.productId
    ) {
      throw new StorePurchaseError(
        400,
        'product_mismatch',
        'المنتج لا يطابق عملية الشراء',
      );
    }
    const accountUser =
      verified.accountToken && UUID_RE.test(verified.accountToken)
        ? verified.accountToken
        : null;
    if (
      opts.expectedUserId &&
      accountUser &&
      accountUser !== opts.expectedUserId.toLowerCase()
    ) {
      throw new StorePurchaseError(
        403,
        'purchase_other_account',
        'عملية الشراء مرتبطة بحساب آخر في سَرح',
      );
    }
    if (verified.state === 'pending') return { status: 'pending' };

    const existing = await this.repo.findByTransaction(
      verified.platform,
      verified.transactionId,
    );
    if (
      existing &&
      opts.expectedUserId &&
      existing.userId !== opts.expectedUserId
    ) {
      throw new StorePurchaseError(
        403,
        'purchase_other_account',
        'عملية الشراء مرتبطة بحساب آخر في سَرح',
      );
    }
    if (verified.state === 'revoked') {
      if (existing)
        await this.applyRevoke(
          existing.id,
          existing.userId,
          existing.paymentId,
          existing.productKind,
          product.planSlug,
          'store_revoked',
        );
      return { status: 'revoked', transactionId: verified.transactionId };
    }
    if (verified.state === 'expired') {
      if (existing) await this.repo.markExpired([existing.id]);
      return { status: 'expired', transactionId: verified.transactionId };
    }

    // A previous period of the same subscription tells us the owner on renewals.
    const chain =
      product.kind === 'subscription'
        ? await this.repo.findLatestInChain({
            platform: verified.platform,
            originalTransactionId: verified.originalTransactionId,
            purchaseTokens: verified.purchaseToken
              ? [verified.purchaseToken]
              : [],
          })
        : null;
    if (chain && opts.expectedUserId && chain.userId !== opts.expectedUserId) {
      throw new StorePurchaseError(
        403,
        'purchase_other_account',
        'هذا الاشتراك مرتبط بحساب آخر في سَرح',
      );
    }
    const userId =
      opts.expectedUserId ??
      accountUser ??
      chain?.userId ??
      opts.fallbackUserId ??
      null;
    if (!userId) {
      throw new StorePurchaseError(
        409,
        'purchase_unlinked',
        'تعذر ربط عملية الشراء بحساب',
      );
    }

    const { claimed, row } = await this.repo.claim({
      verified,
      productKind: product.kind,
      userId,
      listingId: opts.listingId ?? null,
    });
    if (!claimed) {
      if (row.userId !== userId) {
        throw new StorePurchaseError(
          403,
          'purchase_other_account',
          'عملية الشراء مرتبطة بحساب آخر في سَرح',
        );
      }
      if (row.status === 'active' || row.status === 'expired') {
        return { status: 'already_granted', transactionId: row.transactionId };
      }
      if (row.status === 'revoked') {
        return { status: 'revoked', transactionId: row.transactionId };
      }
      return { status: 'processing', transactionId: row.transactionId };
    }

    try {
      const entitlement = await this.entitlements.grant({
        userId,
        product,
        verified,
        listingId: opts.listingId ?? row.listingId ?? null,
        isRenewal: !!chain && chain.transactionId !== verified.transactionId,
      });
      await this.repo.markActive(row.id, entitlement.paymentId);
      this.logger.info(
        {
          platform: verified.platform,
          productId: product.productId,
          kind: product.kind,
          environment: verified.environment,
        },
        'Store purchase verified and granted',
      );
      return {
        status: 'granted',
        transactionId: verified.transactionId,
        entitlement,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.repo.markFailed(row.id, message).catch(() => {});
      throw err;
    }
  }

  private async applyRevoke(
    rowId: string,
    userId: string,
    paymentId: string | null,
    productKind: string,
    planSlug: string | null | undefined,
    reason: string,
  ) {
    const changed = await this.repo.markRevoked(rowId, new Date());
    if (changed.count === 0) return;
    await this.entitlements.revoke({
      userId,
      paymentId,
      productKind,
      planSlug,
      reason,
    });
  }

  // ── App Store Server Notifications V2 ────────────────────────────────────

  async handleAppleNotification(
    signedPayload: unknown,
  ): Promise<{ outcome: string }> {
    if (typeof signedPayload !== 'string' || !signedPayload) {
      throw new StorePurchaseError(
        400,
        'signed_payload_required',
        'signedPayload مطلوب',
      );
    }
    const n =
      this.verifier.verifyAppleJws<AppleNotificationPayload>(signedPayload);
    const type = n.notificationType ?? 'UNKNOWN';
    const notificationId = n.notificationUUID ?? '';
    if (n.data?.bundleId && n.data.bundleId !== appleBundleId()) {
      return { outcome: 'ignored_bundle' };
    }
    if (
      notificationId &&
      (await this.repo.notificationSeen('app_store', notificationId))
    ) {
      return { outcome: 'duplicate' };
    }
    let tx: AppleTransactionPayload | null = null;
    let renewal: AppleRenewalPayload | null = null;
    if (n.data?.signedTransactionInfo) {
      tx = this.verifier.verifyAppleJws<AppleTransactionPayload>(
        n.data.signedTransactionInfo,
      );
    }
    if (n.data?.signedRenewalInfo) {
      renewal = this.verifier.verifyAppleJws<AppleRenewalPayload>(
        n.data.signedRenewalInfo,
      );
    }

    const outcome = await this.applyAppleNotification(
      type,
      n.subtype ?? null,
      tx,
      renewal,
    );
    if (notificationId) {
      await this.repo.recordNotification({
        platform: 'app_store',
        notificationId,
        type,
        subtype: n.subtype ?? null,
        transactionId: tx?.transactionId ? String(tx.transactionId) : null,
        outcome,
      });
    }
    this.logger.info(
      { type, subtype: n.subtype, outcome },
      'App Store notification',
    );
    return { outcome };
  }

  private async applyAppleNotification(
    type: string,
    subtype: string | null,
    tx: AppleTransactionPayload | null,
    renewal: AppleRenewalPayload | null,
  ): Promise<string> {
    if (type === 'TEST') return 'test';
    if (!tx) return 'no_transaction';
    const verified = this.verifier.normalizeAppleTransaction(tx, renewal);
    const product = findStoreProduct(verified.productId);
    if (!product) return 'unknown_product';
    const chainRows = await this.repo.findActiveInChain({
      platform: 'app_store',
      originalTransactionId: verified.originalTransactionId,
    });
    const owner =
      (await this.repo.findLatestInChain({
        platform: 'app_store',
        originalTransactionId: verified.originalTransactionId,
      })) ??
      (await this.repo.findByTransaction('app_store', verified.transactionId));

    // An upgrade takes effect immediately (new transaction in the same chain);
    // a downgrade only at the next renewal, which arrives as DID_RENEW.
    const effectiveType =
      type === 'DID_CHANGE_RENEWAL_PREF' && subtype === 'UPGRADE'
        ? 'SUBSCRIBED'
        : type;

    switch (effectiveType) {
      case 'SUBSCRIBED':
      case 'DID_RENEW':
      case 'OFFER_REDEEMED': {
        if (product.kind !== 'subscription') return 'ignored_kind';
        if (verified.state !== 'purchased') return `state_${verified.state}`;
        try {
          const res = await this.processVerified(verified, {
            fallbackUserId: owner?.userId ?? null,
          });
          return res.status;
        } catch (err) {
          if (
            err instanceof StorePurchaseError &&
            err.code === 'purchase_unlinked'
          ) {
            return 'unlinked';
          }
          throw err;
        }
      }
      case 'DID_CHANGE_RENEWAL_STATUS': {
        if (!owner) return 'unlinked';
        const enabled = subtype === 'AUTO_RENEW_ENABLED';
        await this.repo.setAutoRenew(
          chainRows.map((r) => r.id),
          enabled,
        );
        if (chainRows.length > 0) {
          await this.entitlements.setAutoRenew(
            owner.userId,
            product.planSlug,
            enabled,
          );
        }
        return enabled ? 'auto_renew_on' : 'auto_renew_off';
      }
      case 'EXPIRED':
      case 'GRACE_PERIOD_EXPIRED': {
        if (!owner) return 'unlinked';
        await this.repo.markExpired(chainRows.map((r) => r.id));
        await this.entitlements.expire(owner.userId);
        return 'expired';
      }
      case 'REFUND':
      case 'REVOKE': {
        const row = await this.repo.findByTransaction(
          'app_store',
          verified.transactionId,
        );
        if (!row) return 'unlinked';
        await this.applyRevoke(
          row.id,
          row.userId,
          row.paymentId,
          row.productKind,
          product.planSlug,
          type.toLowerCase(),
        );
        return 'revoked';
      }
      default:
        // DID_FAIL_TO_RENEW, PRICE_INCREASE, CONSUMPTION_REQUEST, REFUND_DECLINED…
        return 'noop';
    }
  }

  // ── Google Play Real-time developer notifications (Pub/Sub push) ────────

  async handleGoogleRtdn(
    authorization: string | undefined,
    body: unknown,
  ): Promise<{ outcome: string }> {
    const api = this.verifier.getGoogleApi();
    if (!(await api.verifyPubSubPushToken(authorization))) {
      throw new StorePurchaseError(
        401,
        'invalid_push_token',
        'رمز Pub/Sub غير صالح',
      );
    }
    const message = (
      body as {
        message?: { data?: string; messageId?: string; message_id?: string };
      }
    )?.message;
    if (!message?.data) {
      throw new StorePurchaseError(
        400,
        'invalid_pubsub_message',
        'رسالة Pub/Sub غير صالحة',
      );
    }
    let n: GoogleRtdn;
    try {
      n = JSON.parse(
        Buffer.from(message.data, 'base64').toString('utf8'),
      ) as GoogleRtdn;
    } catch {
      throw new StorePurchaseError(
        400,
        'invalid_pubsub_message',
        'رسالة Pub/Sub غير صالحة',
      );
    }
    const { packageName } = readGooglePlayConfig();
    if (n.packageName && n.packageName !== packageName)
      return { outcome: 'ignored_package' };
    const notificationId = message.messageId ?? message.message_id ?? '';
    if (
      notificationId &&
      (await this.repo.notificationSeen('google_play', notificationId))
    ) {
      return { outcome: 'duplicate' };
    }

    const { type, outcome, transactionId } =
      await this.applyGoogleNotification(n);
    if (notificationId) {
      await this.repo.recordNotification({
        platform: 'google_play',
        notificationId,
        type,
        transactionId,
        outcome,
      });
    }
    this.logger.info({ type, outcome }, 'Google Play RTDN');
    return { outcome };
  }

  private async applyGoogleNotification(
    n: GoogleRtdn,
  ): Promise<{ type: string; outcome: string; transactionId?: string | null }> {
    if (n.testNotification) return { type: 'test', outcome: 'test' };

    if (n.voidedPurchaseNotification) {
      const v = n.voidedPurchaseNotification;
      const row =
        (v.orderId
          ? await this.repo.findByTransaction('google_play', v.orderId)
          : null) ??
        (v.purchaseToken
          ? await this.repo.findByPurchaseToken('google_play', v.purchaseToken)
          : null);
      if (!row)
        return {
          type: 'voided',
          outcome: 'unlinked',
          transactionId: v.orderId,
        };
      const product = findStoreProduct(row.productId);
      await this.applyRevoke(
        row.id,
        row.userId,
        row.paymentId,
        row.productKind,
        product?.planSlug,
        'google_voided',
      );
      return {
        type: 'voided',
        outcome: 'revoked',
        transactionId: row.transactionId,
      };
    }

    if (n.oneTimeProductNotification) {
      // Consumables are granted by the app's verify call (it knows the listing).
      return {
        type: `one_time_${n.oneTimeProductNotification.notificationType ?? 0}`,
        outcome: 'noop',
      };
    }

    const s = n.subscriptionNotification;
    if (!s?.purchaseToken) return { type: 'unknown', outcome: 'noop' };
    const type = `subscription_${s.notificationType ?? 0}`;
    const api = this.verifier.getGoogleApi();
    const sub = await api.getSubscriptionV2(s.purchaseToken);
    const verified = this.verifier.normalizeGoogleSubscription(
      s.purchaseToken,
      sub,
      s.subscriptionId,
    );
    const product = findStoreProduct(verified.productId);
    if (!product) return { type, outcome: 'unknown_product' };
    const owner = await this.repo.findLatestInChain({
      platform: 'google_play',
      purchaseTokens: [s.purchaseToken, sub.linkedPurchaseToken ?? ''],
    });
    const chainRows = await this.repo.findActiveInChain({
      platform: 'google_play',
      purchaseToken: s.purchaseToken,
    });

    if (s.notificationType === G_SUB.REVOKED) {
      const row =
        (await this.repo.findByTransaction(
          'google_play',
          verified.transactionId,
        )) ?? owner;
      if (!row) return { type, outcome: 'unlinked' };
      await this.applyRevoke(
        row.id,
        row.userId,
        row.paymentId,
        row.productKind,
        product.planSlug,
        'google_revoked',
      );
      return { type, outcome: 'revoked', transactionId: row.transactionId };
    }
    if (s.notificationType === G_SUB.EXPIRED || verified.state === 'expired') {
      if (!owner) return { type, outcome: 'unlinked' };
      await this.repo.markExpired(chainRows.map((r) => r.id));
      await this.entitlements.expire(owner.userId);
      return {
        type,
        outcome: 'expired',
        transactionId: verified.transactionId,
      };
    }
    if (s.notificationType === G_SUB.CANCELED) {
      if (!owner) return { type, outcome: 'unlinked' };
      await this.repo.setAutoRenew(
        chainRows.map((r) => r.id),
        false,
      );
      if (chainRows.length > 0) {
        await this.entitlements.setAutoRenew(
          owner.userId,
          product.planSlug,
          false,
        );
      }
      return {
        type,
        outcome: 'auto_renew_off',
        transactionId: verified.transactionId,
      };
    }
    if (verified.state !== 'purchased') {
      return { type, outcome: `state_${verified.state}` };
    }
    // PURCHASED / RENEWED / RECOVERED / RESTARTED / IN_GRACE_PERIOD…
    try {
      const res = await this.processVerified(verified, {
        fallbackUserId: owner?.userId ?? null,
      });
      if (
        s.notificationType === G_SUB.RESTARTED &&
        owner &&
        verified.autoRenew !== false
      ) {
        await this.repo.setAutoRenew(
          chainRows.map((r) => r.id),
          true,
        );
        await this.entitlements.setAutoRenew(
          owner.userId,
          product.planSlug,
          true,
        );
      }
      return {
        type,
        outcome: res.status,
        transactionId: verified.transactionId,
      };
    } catch (err) {
      if (
        err instanceof StorePurchaseError &&
        err.code === 'purchase_unlinked'
      ) {
        return { type, outcome: 'unlinked' };
      }
      throw err;
    }
  }
}
