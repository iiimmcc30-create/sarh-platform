import { Injectable } from '@nestjs/common';
import { BoostType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { throwApi } from '../../common/exceptions/api.exception';
import { LoggerService } from '../../common/services/logger.service';
import { AppNotificationsService } from '../../queue/services/app-notifications.service';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import {
  formatNiGatewayError,
  isNiSandboxMockMode,
} from '../../payments/ni-client';
import { IntegrationCheckoutService } from '../../integrations/services/integration-checkout.service';
import { BOOST_PLANS } from './boost-plans.config';
import { BOOST_AMOUNT_MIN } from './boost-pricing.util';
import { lookupPromotePrice } from '../promote-catalog';
import { PROMOTE_AMOUNT_MAX } from '../promotion/promotion-limits.config';
import { PaidServicesService } from '../../settings/paid-services.service';

export { BOOST_PLANS } from './boost-plans.config';

function boostNotificationCopy(boostType: BoostType) {
  if (boostType === 'both') {
    return {
      titleAr: '🚀 تم تثبيت وتمييز إعلانك',
      actionAr: 'مثبّت ومميز',
    };
  }
  if (boostType === 'featured') {
    return { titleAr: '⭐ تم تمييز إعلانك', actionAr: 'مميز' };
  }
  return { titleAr: '📌 تم تثبيت إعلانك', actionAr: 'مثبّت' };
}

function listingBoostListingUpdate(boostType: BoostType, expires: Date) {
  if (boostType === 'featured') {
    return { featured: true, featuredUntil: expires };
  }
  if (boostType === 'pinned') {
    return { pinned: true, pinnedUntil: expires };
  }
  return {
    featured: true,
    featuredUntil: expires,
    pinned: true,
    pinnedUntil: expires,
  };
}

function buildOrderRef(prefix: string, userId: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const uid = userId.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `${prefix}-${uid}-${ts}`;
}

type InitiateBoostOptions = {
  boostType: BoostType;
  /** Legacy: day-chip from ListingBoostSheet. Converted to hours internally. */
  durationDays?: number;
  /** Preferred: hour-based duration from promote screen. */
  durationHours?: number;
  /** Ignored — backend always computes the price. Kept for API compatibility. */
  amount?: number;
  method: string;
  promotionGoal?: 'visibility' | 'pinned' | 'featured';
};

@Injectable()
export class ListingBoostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly notifications: AppNotificationsService,
    private readonly cache: RedisCacheService,
    private readonly paidServices: PaidServicesService,
    private readonly integrationCheckout: IntegrationCheckoutService,
  ) {}

  /** Return available boost plans for the frontend. */
  getBoostPlans() {
    return {
      featured: BOOST_PLANS.featured,
      pinned: BOOST_PLANS.pinned,
      both: BOOST_PLANS.both,
    };
  }

  /**
   * Initiate a boost payment for a listing.
   * Price is always looked up from the official catalog; client amount is ignored.
   */
  async initiateBoost(
    user: JwtPayload,
    listingId: string,
    options: InitiateBoostOptions,
  ) {
    const { boostType, method } = options;
    await this.paidServices.assertBoostTypeEnabled(boostType);

    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, sellerId: user.userId, deletedAt: null },
      select: { id: true, arabicTitle: true, status: true },
    });
    if (!listing) throwApi(404, 'listing_not_found', 'الإعلان غير موجود');

    if (!BOOST_PLANS[boostType as keyof typeof BOOST_PLANS]) {
      throwApi(400, 'invalid_boost_type', 'نوع الترقية غير صالح');
    }

    const priced = lookupPromotePrice(boostType, {
      durationHours: options.durationHours,
      durationDays: options.durationDays,
    });
    if (!priced) {
      throwApi(400, 'invalid_duration', 'مدة الترقية غير صالحة');
    }

    const durationHours = priced.durationHours;
    const durationDays = priced.durationDays;
    const amount = priced.amount;

    if (amount < BOOST_AMOUNT_MIN || amount > PROMOTE_AMOUNT_MAX) {
      throwApi(400, 'invalid_amount', 'المبلغ المحسوب غير صالح');
    }

    const startTime = new Date();
    const endTime = new Date(
      startTime.getTime() + durationHours * 60 * 60 * 1000,
    );
    const promotionGoal =
      options.promotionGoal ??
      (boostType === 'featured'
        ? 'featured'
        : boostType === 'pinned'
          ? 'pinned'
          : 'visibility');

    const currency = 'SAR';
    const referenceType = boostType === 'pinned' ? 'pinned_ad' : 'featured_ad';
    const orderPrefix =
      boostType === 'pinned' ? 'PIN' : boostType === 'both' ? 'BOTH' : 'FTR';
    const orderRef = buildOrderRef(orderPrefix, user.userId);

    const descriptionAr =
      boostType === 'featured'
        ? `إعلان مميز: ${listing.arabicTitle} — ${durationHours} ساعة`
        : boostType === 'pinned'
          ? `تثبيت إعلان: ${listing.arabicTitle} — ${durationHours} ساعة`
          : `تثبيت وتمييز: ${listing.arabicTitle} — ${durationHours} ساعة`;

    const prismaMethod = [
      'mada',
      'visa',
      'mastercard',
      'apple_pay',
      'stc_pay',
    ].includes(method)
      ? (method as 'mada' | 'visa' | 'mastercard' | 'apple_pay' | 'stc_pay')
      : 'visa';

    const { boost, payment } = await this.prisma.$transaction(async (tx) => {
      const boost = await tx.listingBoost.create({
        data: {
          listingId,
          userId: user.userId,
          boostType,
          durationDays,
          amount,
          currency,
          status: 'pending',
        },
      });

      const payment = await tx.payment.create({
        data: {
          userId: user.userId,
          orderId: orderRef,
          amount,
          currency,
          method: prismaMethod,
          status: 'pending',
          referenceId: boost.id,
          referenceType,
          descriptionAr,
          description: descriptionAr,
          metadata: {
            boostId: boost.id,
            listingId,
            boostType,
            userId: user.userId,
            durationDays,
            durationHours,
            promotionGoal,
            promotionAmount: amount,
            promotionDurationHours: durationHours,
            totalAmount: amount,
            adId: listingId,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            referenceType,
            pricingFormula: `catalog:${boostType}:${durationHours}h=${amount}`,
          } as Prisma.InputJsonValue,
        },
      });

      return { boost, payment };
    });

    const contact = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { email: true, displayName: true, arabicName: true },
    });
    const appUrl = process.env.APP_URL ?? 'https://sarhsa.online';

    let checkoutUrl: string;

    try {
      const created = await this.integrationCheckout.createHostedCheckout({
        paymentId: payment.id,
        merchantOrderReference: orderRef,
        amount,
        currency,
        description: descriptionAr,
        redirectUrl: `${appUrl}/payment/result?paymentId=${payment.id}&context=boost&listingId=${listingId}`,
        cancelUrl: `${appUrl}/payment/cancel`,
        firstName: contact?.displayName ?? contact?.arabicName ?? 'Customer',
        email: contact?.email ?? '',
        customData: {
          paymentId: payment.id,
          boostId: boost.id,
          listingId,
          boostType,
          userId: user.userId,
          referenceType,
        },
      });
      checkoutUrl = created.checkoutUrl;
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { checkoutUrl, transactionId: created.externalOrderId },
      });
    } catch (err: unknown) {
      const message = formatNiGatewayError(err);
      this.logger.error(
        { err: message, boostId: boost.id },
        'NI boost checkout failed',
      );
      throwApi(502, 'payment_gateway_error', message);
    }

    return {
      boostId: boost.id,
      paymentId: payment.id,
      orderId: orderRef,
      checkoutUrl,
      amount,
      currency,
      devMode: isNiSandboxMockMode(),
    };
  }

  /**
   * Fulfil a boost after NI confirms payment.
   */
  async fulfillBoost(boostId: string, niTransactionId: string) {
    const boost = await this.prisma.listingBoost.findUnique({
      where: { id: boostId },
      include: { listing: { select: { arabicTitle: true } } },
    });
    if (!boost || boost.status === 'paid') return { processed: false };

    const now = new Date();
    const payment = await this.prisma.payment.findFirst({
      where: { referenceId: boostId },
      select: { metadata: true },
    });
    const meta = (payment?.metadata ?? {}) as Record<string, unknown>;
    const durationHours =
      typeof meta.durationHours === 'number' && meta.durationHours > 0
        ? meta.durationHours
        : boost.durationDays * 24;
    const expires = new Date(now.getTime() + durationHours * 60 * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.listingBoost.update({
        where: { id: boostId },
        data: {
          status: 'paid',
          paidAt: now,
          transactionId: niTransactionId,
          startsAt: now,
          expiresAt: expires,
        },
      }),
      this.prisma.listing.update({
        where: { id: boost.listingId },
        data: listingBoostListingUpdate(boost.boostType, expires),
      }),
    ]);

    const { titleAr, actionAr } = boostNotificationCopy(boost.boostType);
    await this.notifications.notifyUser({
      userId: boost.userId,
      type: 'system',
      titleAr,
      bodyAr: `إعلانك "${boost.listing?.arabicTitle}" ${actionAr} حتى ${expires.toLocaleDateString('ar-SA')}.`,
      data: { boostId, listingId: boost.listingId, boostType: boost.boostType },
    });

    this.logger.info(
      { boostId, boostType: boost.boostType, listingId: boost.listingId },
      'Boost fulfilled',
    );
    await this.cache.delPattern('listings:v2:*').catch(() => {});
    await this.cache.del(`listing:${boost.listingId}`).catch(() => {});
    return {
      processed: true,
      boost: {
        id: boostId,
        boostType: boost.boostType,
        listingId: boost.listingId,
        expiresAt: expires,
      },
    };
  }

  /** Dev-only: simulate boost payment without NI. */
  async devCompleteBoost(user: JwtPayload, boostId: string) {
    if (!isNiSandboxMockMode())
      throwApi(403, 'forbidden', 'غير متاح في الإنتاج');

    const boost = await this.prisma.listingBoost.findFirst({
      where: { id: boostId, userId: user.userId },
    });
    if (!boost) throwApi(404, 'not_found', 'الترقية غير موجودة');

    if (boost.status === 'paid') return { boostId, status: 'paid' };

    await this.prisma.payment.updateMany({
      where: { referenceId: boostId, status: 'pending' },
      data: {
        status: 'paid',
        paidAt: new Date(),
        transactionId: `DEV-${boostId}`,
      },
    });

    await this.fulfillBoost(boostId, `DEV-${boostId}`);
    return { boostId, status: 'paid' };
  }

  /** Return active boosts for a given listing. */
  async getListingBoosts(listingId: string) {
    const boosts = await this.prisma.listingBoost.findMany({
      take: 50,
      where: { listingId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        boostType: true,
        durationDays: true,
        amount: true,
        status: true,
        startsAt: true,
        expiresAt: true,
        paidAt: true,
      },
    });
    return { boosts };
  }
}
