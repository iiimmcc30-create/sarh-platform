import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type StorePlatform,
  type StorePurchaseStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { VerifiedStorePurchase } from './store-purchases.types';

const STALE_PROCESSING_MS = 2 * 60 * 1000;

export type StorePurchaseRow = {
  id: string;
  platform: StorePlatform;
  productId: string;
  productKind: string;
  transactionId: string;
  originalTransactionId: string | null;
  purchaseToken: string | null;
  userId: string;
  status: StorePurchaseStatus;
  listingId: string | null;
  paymentId: string | null;
  expiresAt: Date | null;
  updatedAt: Date;
};

const ROW_SELECT = {
  id: true,
  platform: true,
  productId: true,
  productKind: true,
  transactionId: true,
  originalTransactionId: true,
  purchaseToken: true,
  userId: true,
  status: true,
  listingId: true,
  paymentId: true,
  expiresAt: true,
  updatedAt: true,
} as const;

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

@Injectable()
export class StorePurchasesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTransaction(
    platform: StorePlatform,
    transactionId: string,
  ): Promise<StorePurchaseRow | null> {
    return this.prisma.storePurchase.findUnique({
      where: { platform_transactionId: { platform, transactionId } },
      select: ROW_SELECT,
    });
  }

  /** Latest row of a subscription chain (Apple originalTransactionId / Google token). */
  findLatestInChain(params: {
    platform: StorePlatform;
    originalTransactionId?: string | null;
    purchaseTokens?: string[];
  }): Promise<StorePurchaseRow | null> {
    const or: Prisma.StorePurchaseWhereInput[] = [];
    if (params.originalTransactionId) {
      or.push({ originalTransactionId: params.originalTransactionId });
      or.push({ transactionId: params.originalTransactionId });
    }
    for (const token of params.purchaseTokens ?? []) {
      if (token) or.push({ purchaseToken: token });
    }
    if (or.length === 0) return Promise.resolve(null);
    return this.prisma.storePurchase.findFirst({
      where: { platform: params.platform, OR: or },
      orderBy: { createdAt: 'desc' },
      select: ROW_SELECT,
    });
  }

  /**
   * Claims a transaction for granting. Exactly one caller gets
   * `claimed: true` per (platform, transactionId); failed rows and rows stuck
   * in `processing` for > 2 minutes can be re-claimed (retry).
   */
  async claim(params: {
    verified: VerifiedStorePurchase;
    productKind: string;
    userId: string;
    listingId: string | null;
  }): Promise<{ claimed: boolean; row: StorePurchaseRow }> {
    const v = params.verified;
    const data = {
      productId: v.productId,
      productKind: params.productKind,
      originalTransactionId: v.originalTransactionId,
      purchaseToken: v.purchaseToken,
      userId: params.userId,
      autoRenew: v.autoRenew,
      environment: v.environment,
      listingId: params.listingId,
      purchasedAt: v.purchasedAt,
      expiresAt: v.expiresAt,
      raw: v.raw as Prisma.InputJsonValue,
    };
    try {
      const row = await this.prisma.storePurchase.create({
        data: {
          ...data,
          platform: v.platform,
          transactionId: v.transactionId,
          status: 'processing',
        },
        select: ROW_SELECT,
      });
      return { claimed: true, row };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    const existing = await this.findByTransaction(v.platform, v.transactionId);
    if (!existing) throw new Error('store purchase claim race');
    const retryable =
      existing.userId === params.userId &&
      (existing.status === 'failed' ||
        (existing.status === 'processing' &&
          Date.now() - existing.updatedAt.getTime() > STALE_PROCESSING_MS));
    if (!retryable) return { claimed: false, row: existing };
    const updated = await this.prisma.storePurchase.updateMany({
      where: {
        id: existing.id,
        status: existing.status,
        updatedAt: existing.updatedAt,
      },
      data: { ...data, status: 'processing', lastError: null },
    });
    const row = (await this.findByTransaction(v.platform, v.transactionId))!;
    return { claimed: updated.count === 1, row };
  }

  markActive(id: string, paymentId: string | null) {
    return this.prisma.storePurchase.update({
      where: { id },
      data: { status: 'active', paymentId, lastError: null },
    });
  }

  markFailed(id: string, error: string) {
    return this.prisma.storePurchase.update({
      where: { id },
      data: { status: 'failed', lastError: error.slice(0, 500) },
    });
  }

  markExpired(ids: string[]) {
    if (ids.length === 0) return Promise.resolve({ count: 0 });
    return this.prisma.storePurchase.updateMany({
      where: { id: { in: ids }, status: 'active' },
      data: { status: 'expired' },
    });
  }

  markRevoked(id: string, revokedAt: Date) {
    return this.prisma.storePurchase.updateMany({
      where: { id, status: { not: 'revoked' } },
      data: { status: 'revoked', revokedAt },
    });
  }

  setAutoRenew(ids: string[], autoRenew: boolean) {
    if (ids.length === 0) return Promise.resolve({ count: 0 });
    return this.prisma.storePurchase.updateMany({
      where: { id: { in: ids } },
      data: { autoRenew },
    });
  }

  /** Active rows of a chain (for expire / auto-renew updates). */
  findActiveInChain(params: {
    platform: StorePlatform;
    originalTransactionId?: string | null;
    purchaseToken?: string | null;
  }): Promise<StorePurchaseRow[]> {
    const or: Prisma.StorePurchaseWhereInput[] = [];
    if (params.originalTransactionId) {
      or.push({ originalTransactionId: params.originalTransactionId });
      or.push({ transactionId: params.originalTransactionId });
    }
    if (params.purchaseToken) or.push({ purchaseToken: params.purchaseToken });
    if (or.length === 0) return Promise.resolve([]);
    return this.prisma.storePurchase.findMany({
      where: { platform: params.platform, status: 'active', OR: or },
      select: ROW_SELECT,
      take: 100,
    });
  }

  findByPurchaseToken(platform: StorePlatform, purchaseToken: string) {
    return this.prisma.storePurchase.findFirst({
      where: { platform, purchaseToken },
      orderBy: { createdAt: 'desc' },
      select: ROW_SELECT,
    });
  }

  /** Has this user a store-billed subscription currently active? */
  async hasActiveStoreSubscription(userId: string): Promise<boolean> {
    const count = await this.prisma.storePurchase.count({
      where: { userId, productKind: 'subscription', status: 'active' },
    });
    return count > 0;
  }

  notificationSeen(platform: StorePlatform, notificationId: string) {
    return this.prisma.storeNotification
      .findUnique({
        where: { platform_notificationId: { platform, notificationId } },
        select: { id: true },
      })
      .then((r) => !!r);
  }

  async recordNotification(params: {
    platform: StorePlatform;
    notificationId: string;
    type: string;
    subtype?: string | null;
    transactionId?: string | null;
    outcome: string;
  }): Promise<void> {
    try {
      await this.prisma.storeNotification.create({
        data: {
          platform: params.platform,
          notificationId: params.notificationId,
          type: params.type,
          subtype: params.subtype ?? null,
          transactionId: params.transactionId ?? null,
          outcome: params.outcome,
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }

  /** Listing owned by the buyer (boosts / promotion). */
  findOwnedListing(listingId: string, userId: string) {
    return this.prisma.listing.findFirst({
      where: { id: listingId, sellerId: userId, deletedAt: null },
      select: { id: true, arabicTitle: true, views: true },
    });
  }

  /** Same as SubscriptionsRepository.upsertFree: every user has one row. */
  async ensureSubscription(userId: string) {
    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { id: true, planId: true, planAudience: true },
    });
    if (existing) return existing;
    const freePlan = await this.prisma.plan.findUnique({
      where: { slug_audience: { slug: 'free', audience: 'USER' } },
      select: { id: true },
    });
    return this.prisma.subscription.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        planId: 'free',
        planAudience: 'USER',
        planDbId: freePlan?.id ?? null,
        renewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      select: { id: true, planId: true, planAudience: true },
    });
  }

  findSubscription(userId: string) {
    return this.prisma.subscription.findUnique({
      where: { userId },
      select: { id: true, planId: true, planAudience: true, renewDate: true },
    });
  }

  /** Re-enables renewal on the Sarh row (store re-enabled auto-renew). */
  setSubscriptionAutoRenew(userId: string, planId: string, autoRenew: boolean) {
    return this.prisma.subscription.updateMany({
      where: { userId, planId },
      data: { autoRenew },
    });
  }

  /** Paid Payment row for a store subscription period (accounting/history). */
  createPaidSubscriptionPayment(params: {
    userId: string;
    subscriptionId: string;
    orderId: string;
    amount: number;
    currency: string;
    method: 'app_store' | 'google_play';
    transactionId: string;
    descriptionAr: string;
    metadata: Record<string, unknown>;
  }) {
    return this.prisma.payment.upsert({
      where: { orderId: params.orderId },
      update: {},
      create: {
        userId: params.userId,
        subscriptionId: params.subscriptionId,
        referenceId: params.subscriptionId,
        referenceType: 'subscription',
        orderId: params.orderId,
        amount: params.amount,
        currency: params.currency,
        method: params.method,
        status: 'paid',
        transactionId: params.transactionId,
        paidAt: new Date(),
        description: params.descriptionAr,
        descriptionAr: params.descriptionAr,
        metadata: params.metadata as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
  }

  /**
   * Pending ListingBoost / ListingPromotion + Payment, created exactly like
   * ListingBoostService.initiateBoost / ListingPromotionService.initiatePromotion
   * so PaymentsRepository.processSuccessfulPayment fulfils them unchanged.
   * Re-uses the rows if this orderId was created by an earlier failed attempt.
   */
  async createPendingListingPurchase(params: {
    kind: 'boost' | 'promotion';
    userId: string;
    listingId: string;
    baselineViews: number;
    boostType?: 'featured' | 'pinned' | 'both';
    durationDays: number;
    durationHours: number;
    amount: number;
    currency: string;
    method: 'app_store' | 'google_play';
    orderId: string;
    descriptionAr: string;
    tier: { key: string; weight: number };
    metadata: Record<string, unknown>;
  }): Promise<{
    paymentId: string;
    referenceId: string;
    referenceType: 'featured_ad' | 'pinned_ad' | 'promoted_ad';
    status: string;
    metadata: Record<string, unknown>;
  }> {
    const existing = await this.prisma.payment.findUnique({
      where: { orderId: params.orderId },
      select: {
        id: true,
        referenceId: true,
        referenceType: true,
        status: true,
        metadata: true,
      },
    });
    if (existing?.referenceId) {
      return {
        paymentId: existing.id,
        referenceId: existing.referenceId,
        referenceType: existing.referenceType as
          'featured_ad' | 'pinned_ad' | 'promoted_ad',
        status: existing.status,
        metadata: (existing.metadata ?? {}) as Record<string, unknown>,
      };
    }
    return this.prisma.$transaction(async (tx) => {
      let referenceId: string;
      let referenceType: 'featured_ad' | 'pinned_ad' | 'promoted_ad';
      const meta: Record<string, unknown> = { ...params.metadata };
      if (params.kind === 'boost') {
        const boostType = params.boostType ?? 'featured';
        const boost = await tx.listingBoost.create({
          data: {
            listingId: params.listingId,
            userId: params.userId,
            boostType,
            durationDays: params.durationDays,
            amount: params.amount,
            currency: params.currency,
            status: 'pending',
          },
          select: { id: true },
        });
        referenceId = boost.id;
        referenceType = boostType === 'pinned' ? 'pinned_ad' : 'featured_ad';
        meta.boostId = boost.id;
        meta.boostType = boostType;
      } else {
        const promotion = await tx.listingPromotion.create({
          data: {
            listingId: params.listingId,
            userId: params.userId,
            tier: params.tier.key,
            weight: params.tier.weight,
            durationDays: params.durationDays,
            amount: params.amount,
            currency: params.currency,
            status: 'pending',
            baselineViews: params.baselineViews,
          },
          select: { id: true },
        });
        referenceId = promotion.id;
        referenceType = 'promoted_ad';
        meta.promotionId = promotion.id;
        meta.tier = params.tier.key;
      }
      meta.referenceType = referenceType;
      const payment = await tx.payment.create({
        data: {
          userId: params.userId,
          orderId: params.orderId,
          amount: params.amount,
          currency: params.currency,
          method: params.method,
          status: 'pending',
          referenceId,
          referenceType,
          description: params.descriptionAr,
          descriptionAr: params.descriptionAr,
          metadata: meta as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      return {
        paymentId: payment.id,
        referenceId,
        referenceType,
        status: 'pending',
        metadata: meta,
      };
    });
  }

  findListingExpiry(listingId: string) {
    return this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        featuredUntil: true,
        pinnedUntil: true,
        promotedUntil: true,
        arabicTitle: true,
      },
    });
  }
}
