import { Injectable } from '@nestjs/common';
import { LoggerService } from '../common/services/logger.service';
import { AppNotificationsService } from '../queue/services/app-notifications.service';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import { LISTINGS_FEED_CACHE_PATTERN } from '../listings/listings-cache-keys';
import { PaymentsRepository } from '../payments/repositories/payments.repository';
import { PROMOTION_TIERS } from '../listings/promotion/promotion-tiers.config';
import { SubscriptionLifecycleService } from '../subscriptions/services/subscription-lifecycle.service';
import { SubscriptionCacheService } from '../subscriptions/services/subscription-cache.service';
import { StorePurchasesRepository } from './store-purchases.repository';
import {
  StorePurchaseError,
  type GrantContext,
  type GrantResult,
} from './store-purchases.types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function storeOrderId(platform: string, transactionId: string): string {
  const p = platform === 'app_store' ? 'IAP-A' : 'IAP-G';
  return `${p}-${transactionId}`.slice(0, 191);
}

/**
 * Grants the Sarh entitlement for a verified store transaction by re-using
 * the existing activation logic:
 *  - subscriptions → SubscriptionLifecycleService.activateFromPayment with the
 *    store's own expiry as renew date (badge sync + success notification);
 *  - boosts / promotion → the same pending ListingBoost/ListingPromotion +
 *    Payment rows the N-Genius flow creates, fulfilled by
 *    PaymentsRepository.processSuccessfulPayment (extend-from-current, listing
 *    flags) — no N-Genius code path is touched.
 */
@Injectable()
export class StoreEntitlementsService {
  constructor(
    private readonly repo: StorePurchasesRepository,
    private readonly payments: PaymentsRepository,
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly subscriptionCache: SubscriptionCacheService,
    private readonly notifications: AppNotificationsService,
    private readonly cache: RedisCacheService,
    private readonly logger: LoggerService,
  ) {}

  async grant(ctx: GrantContext): Promise<GrantResult> {
    if (ctx.product.kind === 'subscription') return this.grantSubscription(ctx);
    return this.grantListingService(ctx);
  }

  private amountFor(ctx: GrantContext) {
    // Reference SAR catalog price (gross, before the store commission); the
    // price the store actually charged is kept in metadata.storePrice.
    return { amount: ctx.product.referencePriceSar, currency: 'SAR' };
  }

  private async grantSubscription(ctx: GrantContext): Promise<GrantResult> {
    const { product, verified } = ctx;
    if (!product.planSlug) throw new Error('subscription product without plan');
    const expiresAt = verified.expiresAt ?? new Date(Date.now() + 30 * DAY_MS);
    const sub = await this.repo.ensureSubscription(ctx.userId);
    const { amount, currency } = this.amountFor(ctx);
    const payment = await this.repo.createPaidSubscriptionPayment({
      userId: ctx.userId,
      subscriptionId: sub.id,
      orderId: storeOrderId(verified.platform, verified.transactionId),
      amount,
      currency,
      method: verified.platform,
      transactionId: verified.transactionId,
      descriptionAr: `${product.titleAr} (${verified.platform === 'app_store' ? 'App Store' : 'Google Play'})`,
      metadata: {
        source: 'store_iap',
        platform: verified.platform,
        productId: product.productId,
        targetPlanId: product.planSlug,
        billingCycle: product.billingCycle ?? 'monthly',
        originalTransactionId: verified.originalTransactionId,
        storeEnvironment: verified.environment,
        storePrice: verified.storePrice,
        expiresAt: expiresAt.toISOString(),
        subscriptionFulfilled: true,
      },
    });
    await this.lifecycle.activateFromPayment({
      subscriptionId: sub.id,
      userId: ctx.userId,
      targetPlanId: product.planSlug,
      planAudience: sub.planAudience,
      billingCycle: product.billingCycle ?? 'monthly',
      renewDate: expiresAt,
      amount,
      currency,
      isRenewal: ctx.isRenewal,
    });
    if (verified.autoRenew === false) {
      await this.repo.setSubscriptionAutoRenew(
        ctx.userId,
        product.planSlug,
        false,
      );
      await this.subscriptionCache.invalidate(ctx.userId);
    }
    return {
      kind: 'subscription',
      planSlug: product.planSlug,
      renewDate: expiresAt,
      paymentId: payment.id,
    };
  }

  private async grantListingService(ctx: GrantContext): Promise<GrantResult> {
    const { product, verified } = ctx;
    if (!ctx.listingId) {
      throw new StorePurchaseError(
        400,
        'listing_required',
        'حدد الإعلان المراد ترقيته',
      );
    }
    const listing = await this.repo.findOwnedListing(ctx.listingId, ctx.userId);
    if (!listing) {
      throw new StorePurchaseError(
        404,
        'listing_not_found',
        'الإعلان غير موجود',
      );
    }
    const durationHours = product.durationHours ?? 24;
    const durationDays = product.durationDays ?? Math.ceil(durationHours / 24);
    const { amount, currency } = this.amountFor(ctx);
    const now = new Date();
    const kind = product.kind === 'promotion' ? 'promotion' : 'boost';
    const boostType = product.boostType ?? 'featured';
    const descriptionAr =
      kind === 'promotion'
        ? `تعزيز إعلان: ${listing.arabicTitle} — ${durationHours} ساعة`
        : boostType === 'featured'
          ? `إعلان مميز: ${listing.arabicTitle} — ${durationHours} ساعة`
          : boostType === 'pinned'
            ? `تثبيت إعلان: ${listing.arabicTitle} — ${durationHours} ساعة`
            : `تثبيت وتمييز: ${listing.arabicTitle} — ${durationHours} ساعة`;
    const pending = await this.repo.createPendingListingPurchase({
      kind,
      userId: ctx.userId,
      listingId: listing.id,
      baselineViews: listing.views ?? 0,
      boostType: kind === 'boost' ? boostType : undefined,
      durationDays,
      durationHours,
      amount,
      currency,
      method: verified.platform,
      orderId: storeOrderId(verified.platform, verified.transactionId),
      descriptionAr,
      tier: PROMOTION_TIERS.standard,
      metadata: {
        source: 'store_iap',
        platform: verified.platform,
        productId: product.productId,
        listingId: listing.id,
        adId: listing.id,
        userId: ctx.userId,
        durationDays,
        durationHours,
        promotionGoal:
          kind === 'promotion'
            ? 'visibility'
            : boostType === 'both'
              ? 'visibility'
              : boostType,
        promotionAmount: amount,
        promotionDurationHours: durationHours,
        totalAmount: amount,
        startTime: now.toISOString(),
        endTime: new Date(
          now.getTime() + durationHours * 3600_000,
        ).toISOString(),
        storeEnvironment: verified.environment,
        storePrice: verified.storePrice,
        pricingFormula: `store:${product.productId}=${amount}`,
      },
    });

    const result = await this.payments.processSuccessfulPayment({
      paymentId: pending.paymentId,
      niTransactionId: verified.transactionId,
      type: pending.referenceType,
      referenceId: pending.referenceId,
      userId: ctx.userId,
      targetPlanId: undefined,
      billingCycle: 'monthly',
      storedMeta: pending.metadata,
    });

    await this.cache.delPattern(LISTINGS_FEED_CACHE_PATTERN).catch(() => {});
    await this.cache.del(`listing:${listing.id}`).catch(() => {});

    const expiresAt =
      result.boost?.expiresAt ?? result.promotion?.expiresAt ?? null;
    if (result.processed && expiresAt) {
      const until = expiresAt.toLocaleDateString('ar-SA');
      await this.notifications
        .notifyUser({
          userId: ctx.userId,
          type: 'system',
          titleAr:
            kind === 'promotion'
              ? '🚀 تم تفعيل تعزيز إعلانك'
              : boostType === 'both'
                ? '🚀 تم تثبيت وتمييز إعلانك'
                : boostType === 'featured'
                  ? '⭐ تم تمييز إعلانك'
                  : '📌 تم تثبيت إعلانك',
          bodyAr: `إعلانك "${listing.arabicTitle}" مفعّل حتى ${until}.`,
          data: { listingId: listing.id, paymentId: pending.paymentId },
        })
        .catch(() => {});
    }
    this.logger.info(
      {
        platform: verified.platform,
        productId: product.productId,
        listingId: listing.id,
        processed: result.processed,
      },
      'Store purchase granted (listing service)',
    );
    return kind === 'promotion'
      ? {
          kind: 'promotion',
          listingId: listing.id,
          expiresAt,
          paymentId: pending.paymentId,
        }
      : {
          kind: 'boost',
          listingId: listing.id,
          boostType,
          expiresAt,
          paymentId: pending.paymentId,
        };
  }

  /** Store refund / revoke: mirror the N-Genius refund handling. */
  async revoke(params: {
    userId: string;
    paymentId: string | null;
    productKind: string;
    planSlug?: string | null;
    reason: string;
  }): Promise<void> {
    if (params.paymentId) {
      await this.payments.markPaymentRefunded(params.paymentId, {
        refundedAt: new Date().toISOString(),
        refundEvent: params.reason,
        source: 'store_iap',
      });
    }
    if (params.productKind === 'subscription' && params.planSlug) {
      const sub = await this.repo.findSubscription(params.userId);
      // Only downgrade when the refunded plan is still the active one.
      if (sub && sub.planId === params.planSlug) {
        await this.lifecycle.downgradeUser(
          params.userId,
          sub.planId,
          sub.planAudience,
          'refund',
        );
      }
    }
    await this.subscriptionCache.invalidate(params.userId);
  }

  async expire(userId: string): Promise<void> {
    await this.lifecycle.expireIfNeededForUser(userId);
  }

  async setAutoRenew(
    userId: string,
    planSlug: string | null | undefined,
    autoRenew: boolean,
  ) {
    if (!autoRenew) {
      await this.lifecycle.cancelAutoRenew(userId);
      return;
    }
    if (planSlug) {
      await this.repo.setSubscriptionAutoRenew(userId, planSlug, true);
      await this.subscriptionCache.invalidate(userId);
    }
  }
}
