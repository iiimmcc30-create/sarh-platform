import {
  Injectable,
  Inject,
  forwardRef,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import crypto from 'crypto';
import { PaymentReferenceType, PlanAudience } from '@prisma/client';
import { normalizePlanSlug, type BillingCycle } from '../lib/plans';
import { throwApi } from '../common/exceptions/api.exception';
import { LoggerService } from '../common/services/logger.service';
import { AppNotificationsService } from '../queue/services/app-notifications.service';
import { SubscriptionCacheService } from '../subscriptions/services/subscription-cache.service';
import { SubscriptionLifecycleService } from '../subscriptions/services/subscription-lifecycle.service';
import { SubscriptionEntitlementService } from '../subscriptions/services/subscription-entitlement.service';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import { PlansService } from '../plans/plans.service';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { InitiatePaymentDto } from './dto/payments.dto';
import { PaymentsRepository } from './repositories/payments.repository';
import {
  classifyNiOrderState,
  extractNiPaymentStates,
  fetchNiOrderResolved,
  formatNiGatewayError,
  isNiSandboxMockMode,
  NiGatewayError,
  niOrderStateLabelAr,
  resolveNiOrderState,
  validateNiEnvironment,
  verifyNiOrderForCheckout,
  isNiOrderUuid,
  type NiLogFn,
} from './ni-client';
import { IntegrationCheckoutService } from '../integrations/services/integration-checkout.service';
import { redactSensitive } from '../integrations/utils/redact.util';
import { PaidServicesService } from '../settings/paid-services.service';
import { SocketEmitService } from '../gateway/services/socket-emit.service';
import {
  calculateListingFeeAmount,
  parsePositiveMoneyAmount,
} from '../listings/listing-fee';
import { Sentry } from '../shared/lib/sentry';

function buildNIOrderReference(userId: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const uid = userId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `SFAT-${uid}-${ts}`;
}

function verifyNISignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature.replace(/^sha256=/, ''), 'hex'),
    );
  } catch {
    return false;
  }
}

// ── NI order state → local outcome (return URL / sync — confirmed capture only) ──
function niStateIsSuccess(state: string): boolean {
  return classifyNiOrderState(state) === 'success';
}
function niStateIsFailure(state: string): boolean {
  return classifyNiOrderState(state) === 'failed';
}

function normalizeMoney(value: number): number {
  return Math.round(value * 100);
}

function sameMoneyAmount(a: number, b: number): boolean {
  return normalizeMoney(a) === normalizeMoney(b);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reconciliationFlags(metadata: unknown): {
  capturedAfterCancel?: boolean;
  needsReconciliation?: boolean;
} {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  if (meta.capturedAfterCancel === true || meta.needsReconciliation === true) {
    return { capturedAfterCancel: true, needsReconciliation: true };
  }
  return {};
}

const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000; // every 5 min
const STALE_AFTER_MINUTES = 10; // payments older than 10 min
/** Crash window: pending row exists but checkout URL was never written. */
const STALE_PENDING_WITHOUT_CHECKOUT_MS = 2 * 60 * 1000;

@Injectable()
export class PaymentsService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly inFlightInitiations = new Map<
    string,
    Promise<{
      paymentId: string;
      orderId: string | null;
      checkoutUrl: string;
      status: 'pending' | 'paid' | 'refunded';
      devMode: boolean;
      alreadyPaid?: boolean;
    }>
  >();

  constructor(
    private readonly repo: PaymentsRepository,
    private readonly logger: LoggerService,
    private readonly notifications: AppNotificationsService,
    private readonly subscriptionCache: SubscriptionCacheService,
    private readonly subscriptionLifecycle: SubscriptionLifecycleService,
    private readonly entitlements: SubscriptionEntitlementService,
    private readonly plans: PlansService,
    private readonly cache: RedisCacheService,
    private readonly paidServices: PaidServicesService,
    private readonly sockets: SocketEmitService,
    @Inject(forwardRef(() => IntegrationCheckoutService))
    private readonly integrationCheckout: IntegrationCheckoutService,
  ) {}

  private emitPaidButcherOrderCreated(order: {
    id: string;
    orderNumber: string;
    butcherId: string;
    customerId: string;
    butcherUserId: string;
  }) {
    this.sockets.emitToUser(order.customerId, 'order.created', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: 'pending',
      paymentStatus: 'paid',
      butcherId: order.butcherId,
      customerId: order.customerId,
    });
    this.sockets.emitToUser(order.butcherUserId, 'order.created', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: 'pending',
      paymentStatus: 'paid',
      butcherId: order.butcherId,
      customerId: order.customerId,
    });
    this.sockets.getServer()?.emit('admin.order.created', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: 'pending',
      paymentStatus: 'paid',
      butcherId: order.butcherId,
      customerId: order.customerId,
    });
  }

  private async notifyPaidButcherOrder(order: {
    id: string;
    orderNumber: string;
    butcherId: string;
    customerId: string;
    butcherUserId: string;
  }) {
    this.emitPaidButcherOrderCreated(order);
    await Promise.all([
      this.notifications.notifyUser({
        userId: order.customerId,
        type: 'order_update',
        titleAr: `طلب ${order.orderNumber}`,
        bodyAr: 'تم الدفع بنجاح ووصل طلبك للملحمة',
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentStatus: 'paid',
          status: 'pending',
          butcherId: order.butcherId,
        },
      }),
      this.notifications.notifyUser({
        userId: order.butcherUserId,
        type: 'system',
        titleAr: 'طلب مدفوع جديد',
        bodyAr: `وصلك طلب مدفوع رقم ${order.orderNumber}`,
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentStatus: 'paid',
          status: 'pending',
          butcherId: order.butcherId,
        },
      }),
    ]);
  }

  private async invalidateListingCaches(listingId?: string) {
    await this.cache.delPattern('listings:v2:*').catch(() => {});
    if (listingId) {
      await this.cache.del(`listing:${listingId}`).catch(() => {});
    }
  }

  private async resolveAudience(userId: string): Promise<PlanAudience> {
    return this.entitlements.getAudienceForUser(userId);
  }

  private async checkReference(
    userId: string,
    type: string,
    referenceId: string,
    amount: number,
    targetPlanId?: string,
    saleAmount?: number,
  ): Promise<void> {
    if (type === 'subscription') {
      const sub = await this.repo.findSubscriptionForPayment(
        referenceId,
        userId,
      );
      if (!sub) throwApi(404, 'ref_not_found', 'الاشتراك غير موجود');
      const audience = await this.resolveAudience(userId);
      if (
        targetPlanId &&
        this.subscriptionLifecycle.shouldBlockPayment(
          sub,
          normalizePlanSlug(targetPlanId),
          audience,
        )
      ) {
        throwApi(
          400,
          'subscription_active',
          'اشتراكك لا يزال سارياً حتى تاريخ التجديد',
        );
      }
      return;
    }

    if (type === 'fee' || type === 'listing_fee' || type === 'commission') {
      await this.paidServices.assertListingFeesEnabled();
      const fee = await this.repo.findPendingFee(referenceId, userId);
      if (!fee) {
        throwApi(404, 'fee_not_found', 'الرسوم غير موجودة أو مسددة بالفعل');
      }
      const declared = parsePositiveMoneyAmount(saleAmount);
      if (declared == null) {
        throwApi(
          400,
          'invalid_sale_amount',
          'أدخل مبلغ بيع صالحاً أكبر من صفر',
        );
      }
      const payable = calculateListingFeeAmount(declared);
      if (!sameMoneyAmount(payable, amount)) {
        throwApi(
          400,
          'amount_mismatch',
          `المبلغ غير مطابق. المبلغ الصحيح: ${payable} ريال`,
        );
      }
      return;
    }

    if (type === 'order_commission') {
      throwApi(
        400,
        'invalid_type',
        'عمولة الطلب دفتر داخلي ولا تُبدأ من بوابة الدفع',
      );
    }

    if (type === 'butcher_order') {
      const order = await this.repo.findUnpaidButcherOrder(referenceId, userId);
      if (!order) {
        throwApi(404, 'order_not_found', 'الطلب غير موجود أو تم سداده مسبقاً');
      }
      if (!sameMoneyAmount(order.totalPrice, amount)) {
        throwApi(
          400,
          'amount_mismatch',
          `المبلغ غير مطابق. المبلغ الصحيح: ${order.totalPrice} ${order.currency}`,
        );
      }
      return;
    }

    if (type === 'butcher_checkout') {
      const checkout = await this.repo.findPayableButcherCheckout(
        referenceId,
        userId,
      );
      if (!checkout) {
        throwApi(
          404,
          'checkout_not_found',
          'محاولة الدفع غير موجودة أو انتهت صلاحيتها',
        );
      }
      if (!sameMoneyAmount(checkout.totalPrice, amount)) {
        throwApi(
          400,
          'amount_mismatch',
          `المبلغ غير مطابق. المبلغ الصحيح: ${checkout.totalPrice} ${checkout.currency}`,
        );
      }
      return;
    }

    throwApi(400, 'invalid_type', 'نوع الدفع غير صالح');
  }

  private niLog: NiLogFn = (event, data) => {
    this.logger.info({ niEvent: event, ...data }, `NI ${event}`);
  };

  private resolveNiOrderRef(payment: {
    transactionId?: string | null;
    orderId?: string | null;
  }): string | null {
    const tx = payment.transactionId?.trim();
    if (tx && !tx.startsWith('DEV-') && isNiOrderUuid(tx)) return tx;
    return null;
  }

  private async tryReuseExistingPendingPayment(existing: {
    id: string;
    checkoutUrl: string | null;
    orderId: string | null;
    transactionId: string | null;
    createdAt: Date;
  }): Promise<{
    paymentId: string;
    orderId: string | null;
    checkoutUrl: string;
    status: 'pending' | 'paid' | 'refunded';
    devMode: boolean;
    alreadyPaid?: boolean;
  } | null> {
    const isDev = isNiSandboxMockMode();

    this.logger.info(
      {
        paymentId: existing.id,
        orderId: existing.orderId,
        transactionId: existing.transactionId,
        hasCheckoutUrl: Boolean(existing.checkoutUrl),
      },
      'Evaluating existing pending payment for reuse',
    );

    if (!existing.checkoutUrl?.trim()) {
      const pendingAgeMs = Date.now() - existing.createdAt.getTime();
      if (pendingAgeMs >= STALE_PENDING_WITHOUT_CHECKOUT_MS) {
        this.logger.warn(
          {
            paymentId: existing.id,
            pendingAgeMs,
            reason: 'stale_pending_without_checkout',
          },
          'Stale pending payment has no checkout URL — allowing recovery',
        );
        return null;
      }

      const waitUntil = Date.now() + 8_000;
      while (Date.now() < waitUntil) {
        await sleep(250);
        const refreshed = await this.repo.findPaymentByIdFull(existing.id);
        if (refreshed?.checkoutUrl?.trim()) {
          existing = {
            id: refreshed.id,
            checkoutUrl: refreshed.checkoutUrl,
            orderId: refreshed.orderId,
            transactionId: refreshed.transactionId,
            createdAt: refreshed.createdAt,
          };
          break;
        }
      }
    }

    if (!existing.checkoutUrl?.trim()) {
      this.logger.warn(
        { paymentId: existing.id, reason: 'missing_checkout_url' },
        'Existing pending payment invalid — no checkout URL',
      );
      throwApi(
        409,
        'payment_in_progress',
        'عملية الدفع قيد التهيئة. حاول مجدداً خلال ثوانٍ.',
      );
    }

    if (isDev) {
      this.logger.info(
        { paymentId: existing.id },
        'Returning existing pending payment (dev mock)',
      );
      return {
        paymentId: existing.id,
        orderId: existing.orderId,
        checkoutUrl: existing.checkoutUrl,
        status: 'pending',
        devMode: true,
      };
    }

    const niOrderRef = this.resolveNiOrderRef(existing);
    if (!niOrderRef) {
      this.logger.warn(
        { paymentId: existing.id, reason: 'missing_ni_order_ref' },
        'Existing pending payment invalid — no NI order reference',
      );
      return null;
    }

    const verification = await verifyNiOrderForCheckout(
      {
        niOrderRef,
        storedCheckoutUrl: existing.checkoutUrl,
        merchantOrderReference: existing.orderId,
      },
      this.niLog,
    );

    this.logger.info(
      {
        paymentId: existing.id,
        orderReference: niOrderRef,
        paymentState: verification.state,
        valid: verification.valid,
        reason: verification.reason,
        httpStatus: verification.httpStatus,
        paymentUrl: verification.checkoutUrl,
      },
      'NI pending payment verification result',
    );

    if (verification.reason === 'already_paid') {
      const classified = classifyNiOrderState(verification.state ?? '');
      this.logger.warn(
        {
          paymentId: existing.id,
          orderReference: niOrderRef,
          paymentState: verification.state,
          classified,
        },
        'NI reports existing payment already paid — syncing, not archiving',
      );

      if (classified === 'success') {
        try {
          await this.syncPaymentByOrderRef(
            existing.id,
            existing.orderId ?? niOrderRef,
          );
        } catch (err) {
          this.logger.error(
            {
              err: err instanceof Error ? err.message : String(err),
              paymentId: existing.id,
            },
            'Failed to sync already-paid NI order — not creating a new checkout',
          );
        }
      }

      const latest = await this.repo.findPaymentByIdFull(existing.id);
      const status =
        latest?.status === 'paid' || latest?.status === 'refunded'
          ? latest.status
          : classified === 'success'
            ? 'paid'
            : 'pending';

      return {
        paymentId: existing.id,
        orderId: existing.orderId,
        checkoutUrl: existing.checkoutUrl ?? '',
        status,
        devMode: false,
        alreadyPaid: true,
      };
    }

    if (!verification.valid) {
      return null;
    }

    const checkoutUrl = verification.checkoutUrl ?? existing.checkoutUrl;
    if (
      checkoutUrl !== existing.checkoutUrl ||
      (verification.niOrderReference &&
        verification.niOrderReference !== existing.transactionId)
    ) {
      const full = await this.repo.findPaymentByIdFull(existing.id);
      const prevMeta = (full?.metadata ?? {}) as Record<string, unknown>;
      await this.repo
        .updatePaymentCheckout(existing.id, {
          transactionId:
            verification.niOrderReference ??
            existing.transactionId ??
            niOrderRef,
          checkoutUrl,
          metadata: {
            ...prevMeta,
            checkoutUrlRefreshedAt: new Date().toISOString(),
            niOrderReference:
              verification.niOrderReference ?? prevMeta.niOrderReference,
          },
        })
        .catch(() => {});
    }

    this.logger.info(
      {
        paymentId: existing.id,
        orderReference: verification.niOrderReference ?? niOrderRef,
        paymentUrl: checkoutUrl,
        paymentState: verification.state,
      },
      'Returning verified existing pending payment',
    );

    return {
      paymentId: existing.id,
      orderId: existing.orderId,
      checkoutUrl,
      status: 'pending',
      devMode: false,
    };
  }

  private async createCheckoutForPayment(params: {
    payment: { id: string; orderId: string };
    orderReference: string;
    amount: number;
    currency: string;
    method: string;
    description?: string;
    descriptionAr?: string;
    paymentMetadata: Record<string, unknown>;
    type: string;
    referenceId?: string;
    userId: string;
    planId?: string;
    billingCycle?: string;
    contact?: {
      displayName?: string | null;
      arabicName?: string | null;
      email?: string | null;
    } | null;
  }) {
    const {
      payment,
      orderReference,
      amount,
      currency,
      description,
      descriptionAr,
      paymentMetadata,
      type,
      referenceId,
      userId,
      planId,
      billingCycle,
      contact,
    } = params;

    const isDev = isNiSandboxMockMode();
    let checkoutUrl: string;
    const appUrl = process.env.APP_URL ?? 'https://sarhsa.online';
    const context =
      type === 'butcher_checkout'
        ? 'butcher_checkout'
        : type === 'butcher_order'
          ? 'butcher_order'
          : type;
    const cancelUrl =
      type === 'butcher_checkout' && referenceId
        ? `${appUrl}/payment/cancel?context=butcher_checkout&checkoutId=${encodeURIComponent(referenceId)}&paymentId=${encodeURIComponent(payment.id)}`
        : type === 'butcher_order' && referenceId
          ? `${appUrl}/payment/cancel?context=butcher_order&orderId=${encodeURIComponent(referenceId)}`
          : `${appUrl}/payment/cancel`;
    const redirectUrl = `${appUrl}/payment/result?paymentId=${encodeURIComponent(payment.id)}&context=${encodeURIComponent(context)}`;

    if (isDev) {
      await new Promise((r) => setTimeout(r, 300));
      const mock = await this.integrationCheckout.createHostedCheckout({
        paymentId: payment.id,
        merchantOrderReference: orderReference,
        amount,
        currency,
        description: descriptionAr || description || 'سرح Payment',
        redirectUrl,
        cancelUrl,
        firstName: contact?.displayName ?? contact?.arabicName ?? 'Customer',
        email: contact?.email ?? '',
        customData: {
          paymentId: payment.id,
          type,
          referenceId,
          userId,
          sandbox: true,
        },
      });
      checkoutUrl = mock.checkoutUrl;
      await this.repo.updatePaymentCheckout(payment.id, {
        transactionId: mock.externalOrderId,
        checkoutUrl,
        metadata: { ...paymentMetadata, sandbox: true },
      });
    } else {
      validateNiEnvironment(this.niLog);
      const created = await this.integrationCheckout.createHostedCheckout({
        paymentId: payment.id,
        merchantOrderReference: orderReference,
        amount,
        currency,
        description: descriptionAr || description || 'سرح Payment',
        redirectUrl,
        cancelUrl,
        firstName: contact?.displayName ?? contact?.arabicName ?? 'Customer',
        email: contact?.email ?? '',
        customData: {
          paymentId: payment.id,
          type,
          referenceId,
          userId,
          ...(planId ? { targetPlanId: planId, billingCycle } : {}),
        },
      });

      checkoutUrl = created.checkoutUrl;

      await this.repo.updatePaymentCheckout(payment.id, {
        transactionId: created.externalOrderId,
        checkoutUrl,
        metadata: {
          ...paymentMetadata,
          niOrderReference: created.externalOrderId,
        },
      });

      this.logger.info(
        {
          paymentId: payment.id,
          orderReference: created.externalOrderId,
          merchantOrderReference: orderReference,
          paymentUrl: checkoutUrl,
          paymentState: 'pending',
        },
        'NI checkout created for payment',
      );
    }

    this.logger.info(
      {
        userId,
        orderReference,
        amount,
        type,
        paymentId: payment.id,
        paymentUrl: checkoutUrl,
      },
      'NI Payment initiated',
    );

    return {
      paymentId: payment.id,
      orderId: orderReference,
      checkoutUrl,
      status: 'pending' as const,
      devMode: isDev,
    };
  }

  async initiate(user: JwtPayload, dto: InitiatePaymentDto) {
    const referenceId = dto.referenceId ?? 'no-ref';
    const inFlightKey = `${user.userId}:${dto.type}:${referenceId}`;
    const running = this.inFlightInitiations.get(inFlightKey);
    if (running) return running;

    const promise = this.initiateInternal(user, dto).finally(() => {
      this.inFlightInitiations.delete(inFlightKey);
    });
    this.inFlightInitiations.set(inFlightKey, promise);
    return promise;
  }

  private async initiateInternal(user: JwtPayload, dto: InitiatePaymentDto) {
    const {
      amount,
      currency = 'SAR',
      method,
      type,
      referenceId,
      description,
      descriptionAr,
      planId,
      billingCycle,
      saleAmount,
    } = dto;

    if (type === 'subscription') {
      if (!planId || !billingCycle) {
        throwApi(400, 'validation_error', 'يجب تحديد الباقة ودورة الفوترة');
      }
      const audience = await this.resolveAudience(user.userId);
      const normalizedPlan = normalizePlanSlug(planId);
      const upgradable = this.plans.getUpgradablePlans(audience);
      if (!upgradable.includes(normalizedPlan)) {
        throwApi(400, 'invalid_plan', 'باقة غير صالحة للترقية');
      }
      const expectedAmount = this.plans.getPlanPrice(
        normalizedPlan,
        audience,
        billingCycle as BillingCycle,
      );
      if (!sameMoneyAmount(expectedAmount, amount)) {
        throwApi(
          400,
          'amount_mismatch',
          `المبلغ غير مطابق. المبلغ الصحيح: ${expectedAmount} ريال`,
        );
      }
    }

    if (!referenceId) throwApi(400, 'ref_required', 'معرّف المرجع مطلوب');
    await this.checkReference(
      user.userId,
      type,
      referenceId,
      amount,
      planId,
      saleAmount,
    );

    const isListingFeePay =
      type === 'fee' || type === 'listing_fee' || type === 'commission';
    let storedReferenceId = referenceId;
    let storedReferenceType = type as PaymentReferenceType;
    let feeId: string | undefined;

    if (isListingFeePay) {
      const fee = await this.repo.findPendingFee(referenceId, user.userId);
      if (!fee) {
        throwApi(404, 'fee_not_found', 'الرسوم غير موجودة أو مسددة بالفعل');
      }
      const declared = parsePositiveMoneyAmount(saleAmount);
      if (declared == null) {
        throwApi(
          400,
          'invalid_sale_amount',
          'أدخل مبلغ بيع صالحاً أكبر من صفر',
        );
      }
      const payable = calculateListingFeeAmount(declared);
      await this.repo.recordListingFeeSaleAmount(
        fee.id,
        user.userId,
        declared,
        payable,
      );
      storedReferenceId = fee.id;
      storedReferenceType = 'listing_fee';
      feeId = fee.id;
    }

    const orderReference = buildNIOrderReference(user.userId);
    const contact = await this.repo.findUserContact(user.userId);

    const paymentMetadata: Record<string, unknown> = {
      type: storedReferenceType,
      ...(storedReferenceId ? { referenceId: storedReferenceId } : {}),
      userId: user.userId,
      ...(saleAmount != null ? { saleAmount } : {}),
      ...(type === 'subscription' && planId && billingCycle
        ? { targetPlanId: planId, billingCycle }
        : {}),
    };

    const pendingParams = {
      userId: user.userId,
      orderId: orderReference,
      amount,
      currency,
      method,
      description,
      descriptionAr,
      metadata: paymentMetadata,
      referenceId: storedReferenceId,
      referenceType: storedReferenceType,
      subscriptionId: type === 'subscription' ? referenceId : undefined,
      feeId,
    };

    const txResult =
      await this.repo.createPendingPaymentOrReturnExisting(pendingParams);

    if ('existingPending' in txResult && txResult.existingPending) {
      const existingPending = txResult.existingPending;
      const reused = await this.tryReuseExistingPendingPayment(existingPending);
      if (reused) {
        return reused;
      }

      const archiveReason = 'ni_order_invalid_or_expired';
      await this.repo.archiveInvalidPendingPayment(
        existingPending.id,
        archiveReason,
        { supersededBy: 'new_ni_order' },
      );

      this.logger.warn(
        {
          paymentId: existingPending.id,
          orderId: existingPending.orderId,
          transactionId: existingPending.transactionId,
          reason: archiveReason,
        },
        'Archived invalid pending payment — creating fresh NI order',
      );

      const freshOrderReference = buildNIOrderReference(user.userId);
      const payment = await this.repo.createPendingPayment({
        ...pendingParams,
        orderId: freshOrderReference,
      });

      try {
        return await this.createCheckoutForPayment({
          payment,
          orderReference: freshOrderReference,
          amount,
          currency,
          method,
          description,
          descriptionAr,
          paymentMetadata,
          type,
          referenceId,
          userId: user.userId,
          planId,
          billingCycle,
          contact,
        });
      } catch (err: unknown) {
        await this.repo.markPaymentFailed(payment.id).catch(() => {});
        const message = formatNiGatewayError(err);
        this.logger.error(
          {
            err: message,
            paymentId: payment.id,
            httpStatus:
              err instanceof NiGatewayError ? err.httpStatus : undefined,
            niResponseBody:
              err instanceof NiGatewayError ? err.niBody : undefined,
          },
          'NI API error after archiving stale pending payment',
        );
        Sentry.captureException(err);
        throwApi(502, 'payment_gateway_error', message);
      }
    }

    const payment = txResult.payment!;

    try {
      return await this.createCheckoutForPayment({
        payment,
        orderReference,
        amount,
        currency,
        method,
        description,
        descriptionAr,
        paymentMetadata,
        type,
        referenceId,
        userId: user.userId,
        planId,
        billingCycle,
        contact,
      });
    } catch (err: unknown) {
      const message = formatNiGatewayError(err);
      this.logger.error(
        {
          err: message,
          paymentId: payment.id,
          httpStatus:
            err instanceof NiGatewayError ? err.httpStatus : undefined,
          niResponseBody:
            err instanceof NiGatewayError ? err.niBody : undefined,
        },
        'NI API error — local payment kept pending',
      );
      Sentry.captureException(err);
      throwApi(502, 'payment_gateway_error', message);
    }
  }

  verifyWebhookSignature(
    rawBody: string,
    signature: string | undefined,
  ): { ok: true } | { ok: false; status: number; error: string } {
    const webhookSecret = process.env.NI_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      if (!verifyNISignature(rawBody, signature, webhookSecret)) {
        this.logger.warn(
          { signature: signature?.slice(0, 8) },
          'Invalid NI webhook signature',
        );
        return { ok: false, status: 401, error: 'invalid_signature' };
      }
      return { ok: true };
    }

    if (process.env.NODE_ENV === 'production') {
      this.logger.error(
        {},
        'NI Webhook received without signature in production',
      );
      return { ok: false, status: 401, error: 'missing_signature' };
    }

    return { ok: true };
  }

  async processWebhook(rawBody: string) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return { status: 400, body: { error: 'invalid_json' } };
    }

    try {
      await this.handleNIWebhook(event);
    } catch (err) {
      this.logger.error(
        {
          err: err instanceof Error ? err.message : String(err),
          eventName: String(event.eventName ?? event.type ?? ''),
          payload: redactSensitive(event),
        },
        'NI Webhook processing error',
      );
      Sentry.captureException(err);
      return { status: 500, body: { error: 'webhook_processing_failed' } };
    }

    return { status: 200, body: { received: true } };
  }

  private async handleNIWebhook(event: Record<string, unknown>) {
    const order = (event.order ?? event) as Record<string, unknown>;
    const eventType = String(event.eventName ?? event.type ?? '');

    const merchantAttrs = order?.merchantAttributes as
      Record<string, unknown> | undefined;
    const merchantOrderRef = String(
      merchantAttrs?.merchantOrderReference ??
        order?.merchantOrderReference ??
        order?.reference ??
        '',
    );

    const customData = (order?.customData ?? order?.metadata ?? {}) as Record<
      string,
      unknown
    >;
    const internalPaymentId = customData?.paymentId
      ? String(customData.paymentId)
      : '';

    const payment = await this.repo.findPaymentForWebhook(
      internalPaymentId || undefined,
      merchantOrderRef,
    );

    if (!payment) {
      this.logger.warn(
        { merchantOrderRef, internalPaymentId },
        'NI Webhook: payment not found',
      );
      return;
    }

    const storedMeta = (payment.metadata ?? {}) as Record<string, unknown>;
    const type =
      payment.referenceType ??
      (storedMeta.type as string | undefined) ??
      (customData?.type as string | undefined);
    const referenceId =
      payment.referenceId ??
      (storedMeta.referenceId as string | undefined) ??
      (customData?.referenceId as string | undefined);
    const userId =
      (storedMeta.userId as string | undefined) ??
      (customData?.userId as string | undefined) ??
      payment.userId;
    const targetPlanId =
      (storedMeta.targetPlanId as string | undefined) ??
      (customData?.targetPlanId as string | undefined);
    const billingCycle =
      (storedMeta.billingCycle as string | undefined) ??
      (customData?.billingCycle as string | undefined) ??
      'monthly';

    const orderState = resolveNiOrderState(order);

    const niTransactionId = String(
      order?.reference ?? order?.transactionId ?? merchantOrderRef,
    );

    const isRefundEvent =
      ['ORDER.REVERSED', 'ORDER.REFUNDED', 'ORDER.PARTIALLY_REFUNDED'].includes(
        eventType.toUpperCase(),
      ) || ['REVERSED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(orderState);

    if (payment.status === 'refunded') {
      this.logger.debug(
        { paymentId: payment.id, status: payment.status },
        'NI Webhook already processed',
      );
      return;
    }

    if (payment.status === 'paid' && isRefundEvent) {
      const refunded = await this.repo.markPaymentRefunded(payment.id, {
        ...storedMeta,
        refundedAt: new Date().toISOString(),
        refundEvent: eventType,
      });
      if (!refunded?.newlyRefunded) {
        this.logger.debug(
          { paymentId: payment.id, status: payment.status },
          'NI refund webhook already applied',
        );
        return;
      }
      if (
        type === 'subscription' &&
        referenceId &&
        storedMeta.subscriptionFulfilled === true
      ) {
        const sub = await this.repo.findSubscriptionForPayment(
          referenceId,
          userId,
        );
        if (sub) {
          await this.subscriptionLifecycle.downgradeUser(
            userId,
            sub.planId,
            sub.planAudience ?? (await this.resolveAudience(userId)),
            'refund',
          );
        }
      }
      // Reverse accrued butcher order commission ledger if the order payment refunds.
      if (type === 'butcher_order' && referenceId) {
        await this.repo.markOrderCommissionRefunded(referenceId, {
          refundedAt: new Date().toISOString(),
          refundEvent: eventType,
          sourcePaymentId: payment.id,
        });
      }
      if (type === 'butcher_checkout' && referenceId) {
        const paidOrderId =
          await this.repo.findOrderIdByCheckoutId(referenceId);
        if (paidOrderId) {
          await this.repo.markOrderCommissionRefunded(paidOrderId, {
            refundedAt: new Date().toISOString(),
            refundEvent: eventType,
            sourcePaymentId: payment.id,
          });
        }
      }
      await this.subscriptionCache.invalidate(userId);
      await this.notifications.notifyUser({
        userId,
        type: 'system',
        titleAr: 'تم استرداد الدفع',
        bodyAr: `تم استرداد ${payment.amount} ${payment.currency}.`,
        data: { paymentId: payment.id, transactionId: niTransactionId },
      });
      return;
    }

    const isSuccess =
      [
        'ORDER.PAID',
        'ORDER.CAPTURED',
        'ORDER.PURCHASED',
        'ORDER.SUCCESS',
      ].includes(eventType.toUpperCase()) || niStateIsSuccess(orderState);

    const isFailure =
      [
        'ORDER.FAILED',
        'ORDER.REVERSED',
        'ORDER.CANCELLED',
        'ORDER.DECLINED',
        'ORDER.EXPIRED',
      ].includes(eventType.toUpperCase()) || niStateIsFailure(orderState);

    // Capture after local failure (e.g. cancelled/expired order) must still
    // reconcile — do not treat failed as a terminal skip when NI reports success.
    if (
      (payment.status === 'paid' || payment.status === 'failed') &&
      !(isSuccess && payment.status === 'failed')
    ) {
      this.logger.debug(
        { paymentId: payment.id, status: payment.status },
        'NI Webhook already processed',
      );
      return;
    }

    if (isSuccess) {
      const fulfillment = await this.repo.processSuccessfulPayment({
        paymentId: payment.id,
        niTransactionId,
        type,
        referenceId,
        userId,
        targetPlanId,
        billingCycle,
        storedMeta,
      });

      if (fulfillment.capturedAfterCancel) {
        this.logger.error(
          {
            paymentId: payment.id,
            type,
            referenceId,
            niTransactionId,
          },
          'NI captured payment for a cancelled butcher order — recorded without fulfillment; NI refund API is not implemented in this codebase (needsReconciliation)',
        );
        return;
      }

      if (fulfillment.processed) {
        await this.subscriptionCache.invalidate(userId);

        if (fulfillment.boost) {
          await this.invalidateListingCaches(fulfillment.boost.listingId);
        }
        if (fulfillment.promotion) {
          await this.invalidateListingCaches(fulfillment.promotion.listingId);
        }

        if (fulfillment.subscription) {
          await this.subscriptionLifecycle.notifyRenewalSuccess(
            userId,
            fulfillment.subscription.targetPlanId,
            payment.amount,
            payment.currency,
          );
        } else if (fulfillment.butcherOrder) {
          await this.notifyPaidButcherOrder(fulfillment.butcherOrder);
        } else if (fulfillment.boost) {
          const b = fulfillment.boost;
          const boostCopy =
            b.boostType === 'both'
              ? {
                  titleAr: '🚀 تم تثبيت وتمييز إعلانك',
                  actionAr: 'مثبّت ومميز',
                }
              : b.boostType === 'featured'
                ? { titleAr: '⭐ تم تمييز إعلانك', actionAr: 'مميز' }
                : { titleAr: '📌 تم تثبيت إعلانك', actionAr: 'مثبّت' };
          await this.notifications.notifyUser({
            userId,
            type: 'system',
            titleAr: boostCopy.titleAr,
            bodyAr: `إعلانك ${boostCopy.actionAr} حتى ${b.expiresAt.toLocaleDateString('ar-SA')}.`,
            data: {
              boostId: b.id,
              listingId: b.listingId,
              boostType: b.boostType,
            },
          });
        } else if (type === 'commission') {
          await this.notifications.notifyUser({
            userId,
            type: 'system',
            titleAr: '✅ شكراً على دعمك لسرح',
            bodyAr: `تم استلام عمولتك بمبلغ ${payment.amount} ${payment.currency}. رقم العملية: ${niTransactionId}`,
            data: {
              paymentId: payment.id,
              transactionId: niTransactionId,
              type: 'commission',
            },
          });
        } else {
          await this.notifications.notifyUser({
            userId,
            type: 'system',
            titleAr: '✅ تم الدفع بنجاح',
            bodyAr: `تم سداد ${payment.amount} ${payment.currency}. رقم العملية: ${niTransactionId}`,
            data: { paymentId: payment.id, transactionId: niTransactionId },
          });
        }

        this.logger.info(
          { paymentId: payment.id, type, referenceId, amount: payment.amount },
          'NI Payment confirmed',
        );
      }
    } else if (isFailure) {
      const failed = await this.repo.markPaymentFailedById(payment.id);
      if (!failed.count) {
        this.logger.warn(
          { paymentId: payment.id, eventType },
          'Skipped NI failure transition — payment is not pending',
        );
        return;
      }

      if (type === 'subscription' && targetPlanId) {
        await this.subscriptionLifecycle.notifyRenewalFailed(
          userId,
          targetPlanId,
        );
      } else {
        await this.notifications.notifyUser({
          userId,
          type: 'system',
          titleAr: '❌ فشل الدفع',
          bodyAr: 'فشلت عملية الدفع. يرجى المحاولة مجدداً.',
          data: { paymentId: payment.id },
        });
      }

      this.logger.warn(
        { paymentId: payment.id, eventType },
        'NI Payment failed',
      );
    }
  }

  // ── Auto-sync lifecycle ────────────────────────────────────────────────────

  private syncTimer: ReturnType<typeof setInterval> | null = null;

  onApplicationBootstrap() {
    if (isNiSandboxMockMode()) return; // skip auto-sync without real NI keys

    this.syncTimer = setInterval(() => {
      void this.runAutoSync();
    }, AUTO_SYNC_INTERVAL_MS);

    this.logger.info(
      {},
      `Payment auto-sync started (every ${AUTO_SYNC_INTERVAL_MS / 60000} min)`,
    );
  }

  onApplicationShutdown() {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }

  /**
   * Runs every AUTO_SYNC_INTERVAL_MS in production.
   * Finds stale pending payments and polls NI for their current status.
   */
  private async runAutoSync() {
    try {
      const stalePending =
        await this.repo.findStalePendingPayments(STALE_AFTER_MINUTES);
      if (!stalePending.length) return;

      this.logger.info(
        { count: stalePending.length },
        'Payment auto-sync: checking stale payments',
      );

      await Promise.allSettled(
        stalePending.map((p) =>
          this.syncPaymentByOrderRef(p.id, p.orderId ?? ''),
        ),
      );
    } catch (err) {
      this.logger.error({ err }, 'Payment auto-sync error');
      Sentry.captureException(err);
    }
  }

  /**
   * Manual sync: fetch order status from NI and update local DB.
   * Exposed as POST /api/payments/:id/sync (authenticated, own payment only).
   */
  async syncPayment(user: JwtPayload, paymentId: string) {
    const payment = await this.repo.findPaymentOwnedByUser(
      paymentId,
      user.userId,
    );
    if (!payment) throwApi(404, 'not_found', 'الدفعة غير موجودة');

    if (payment.status === 'paid') {
      const flags = reconciliationFlags(payment.metadata);
      const butcherOrder = flags.needsReconciliation
        ? null
        : await this.repo.findButcherOrderByPaymentId(payment.id);
      return {
        paymentId: payment.id,
        status: 'paid',
        outcome: 'success',
        synced: false,
        messageAr: flags.needsReconciliation
          ? 'تم تأكيد الدفع من N-Genius دون إنشاء طلب للملحمة. الحالة تحتاج مطابقة.'
          : niOrderStateLabelAr('success'),
        ...flags,
        butcherOrder: butcherOrder
          ? {
              id: butcherOrder.id,
              orderNumber: butcherOrder.orderNumber,
              butcherId: butcherOrder.butcherId,
              paymentStatus: butcherOrder.paymentStatus,
              status: butcherOrder.status,
            }
          : undefined,
      };
    }
    if (payment.status === 'refunded') {
      return {
        paymentId: payment.id,
        status: 'refunded',
        outcome: 'processing',
        synced: false,
        messageAr: niOrderStateLabelAr('processing'),
      };
    }

    const orderRef = payment.orderId;
    if (!orderRef) throwApi(400, 'no_order_ref', 'لا يوجد رقم مرجعي للطلب');

    return this.syncPaymentByOrderRef(paymentId, orderRef);
  }

  /**
   * Core sync logic: query NI → update DB → send notifications.
   */
  private async syncPaymentByOrderRef(paymentId: string, orderRef: string) {
    if (isNiSandboxMockMode()) {
      return { paymentId, status: 'pending', synced: false, devMode: true };
    }

    try {
      const existing = await this.repo.findPaymentByIdFull(paymentId);
      const niRef =
        existing?.transactionId &&
        !String(existing.transactionId).startsWith('DEV-') &&
        isNiOrderUuid(String(existing.transactionId))
          ? String(existing.transactionId)
          : isNiOrderUuid(orderRef)
            ? orderRef
            : null;

      if (!niRef) {
        this.logger.warn(
          {
            paymentId,
            orderId: existing?.orderId ?? orderRef,
            transactionId: existing?.transactionId ?? null,
            reason: 'missing_ni_uuid',
          },
          'Cannot sync payment — no NI UUID (internal merchant ref only)',
        );
        return {
          paymentId,
          status: 'pending',
          outcome: 'processing',
          synced: false,
          messageAr:
            'لم يُنشأ طلب الدفع في N-Genius بعد. أعد محاولة الدفع من التطبيق.',
        };
      }

      const { order, state } = await fetchNiOrderResolved(niRef, this.niLog);
      const outcome = classifyNiOrderState(state);
      const paymentStates = extractNiPaymentStates(order);
      const niTxId = String(order.reference ?? order.transactionId ?? niRef);

      this.logger.info(
        {
          paymentId,
          orderRef,
          niOrderReference: niRef,
          paymentState: state,
          orderState: order.state,
          paymentStates,
          outcome,
        },
        'NI return-url sync: order status from N-Genius',
      );

      const payment = existing;
      if (
        !payment ||
        (payment.status !== 'pending' && payment.status !== 'failed')
      ) {
        const terminalStatus = payment?.status ?? 'unknown';
        const flags = reconciliationFlags(payment?.metadata);
        const terminalOutcome =
          terminalStatus === 'paid'
            ? 'success'
            : terminalStatus === 'failed'
              ? 'failed'
              : 'processing';
        const butcherOrder =
          terminalStatus === 'paid' && !flags.needsReconciliation
            ? await this.repo.findButcherOrderByPaymentId(paymentId)
            : null;
        return {
          paymentId,
          status: terminalStatus,
          outcome: terminalOutcome,
          synced: false,
          niState: state,
          messageAr:
            terminalStatus === 'paid' && flags.needsReconciliation
              ? 'تم تأكيد الدفع من N-Genius دون إنشاء طلب للملحمة. الحالة تحتاج مطابقة.'
              : niOrderStateLabelAr(terminalOutcome),
          ...flags,
          butcherOrder: butcherOrder
            ? {
                id: butcherOrder.id,
                orderNumber: butcherOrder.orderNumber,
                butcherId: butcherOrder.butcherId,
                paymentStatus: butcherOrder.paymentStatus,
                status: butcherOrder.status,
              }
            : undefined,
        };
      }

      const storedMeta = (payment.metadata ?? {}) as Record<string, unknown>;
      const type =
        payment.referenceType ??
        (storedMeta.referenceType as string | undefined) ??
        (storedMeta.type as string | undefined);
      const referenceId =
        payment.referenceId ?? (storedMeta.referenceId as string | undefined);
      const userId =
        payment.userId ?? (storedMeta.userId as string | undefined) ?? '';
      const targetPlanId = storedMeta.targetPlanId as string | undefined;
      const billingCycle =
        (storedMeta.billingCycle as string | undefined) ?? 'monthly';

      if (niStateIsSuccess(state)) {
        const fulfillment = await this.repo.processSuccessfulPayment({
          paymentId,
          niTransactionId: niTxId,
          type,
          referenceId,
          userId,
          targetPlanId,
          billingCycle,
          storedMeta,
        });

        const latest = await this.repo.findPaymentByIdFull(paymentId);
        const dbStatus = latest?.status ?? payment.status;
        const flags = {
          ...reconciliationFlags(latest?.metadata),
          ...(fulfillment.capturedAfterCancel
            ? { capturedAfterCancel: true, needsReconciliation: true }
            : {}),
        };

        if (fulfillment.capturedAfterCancel || flags.needsReconciliation) {
          this.logger.error(
            { paymentId, orderRef, state, type, referenceId, dbStatus },
            'NI captured payment for a cancelled butcher order — recorded without fulfillment; NI refund API is not implemented in this codebase (needsReconciliation)',
          );
          return {
            paymentId,
            status: dbStatus,
            outcome: dbStatus === 'paid' ? 'success' : 'failed',
            synced: dbStatus === 'paid',
            capturedAfterCancel: true,
            needsReconciliation: true,
            niState: state,
            messageAr:
              dbStatus === 'paid'
                ? 'تم تأكيد الدفع من N-Genius دون إنشاء طلب للملحمة. الحالة تحتاج مطابقة.'
                : niOrderStateLabelAr('failed'),
            butcherOrder: undefined,
          };
        }

        if (dbStatus !== 'paid') {
          this.logger.warn(
            { paymentId, orderRef, state, dbStatus, type, referenceId },
            'NI reported success but local payment is not paid — returning DB status',
          );
          return {
            paymentId,
            status: dbStatus,
            outcome: dbStatus === 'failed' ? 'failed' : 'processing',
            synced: false,
            niState: state,
            messageAr: niOrderStateLabelAr(
              dbStatus === 'failed' ? 'failed' : 'processing',
            ),
            butcherOrder: undefined,
          };
        }

        if (fulfillment.processed) {
          await this.subscriptionCache.invalidate(userId);

          if (fulfillment.boost) {
            await this.invalidateListingCaches(fulfillment.boost.listingId);
            const b = fulfillment.boost;
            const boostCopy =
              b.boostType === 'both'
                ? {
                    titleAr: '🚀 تم تثبيت وتمييز إعلانك',
                    actionAr: 'مثبّت ومميز',
                  }
                : b.boostType === 'featured'
                  ? { titleAr: '⭐ تم تمييز إعلانك', actionAr: 'مميز' }
                  : { titleAr: '📌 تم تثبيت إعلانك', actionAr: 'مثبّت' };
            await this.notifications.notifyUser({
              userId,
              type: 'system',
              titleAr: boostCopy.titleAr,
              bodyAr: `إعلانك ${boostCopy.actionAr} حتى ${b.expiresAt.toLocaleDateString('ar-SA')}.`,
              data: {
                boostId: b.id,
                listingId: b.listingId,
                boostType: b.boostType,
              },
            });
          } else if (fulfillment.butcherOrder) {
            await this.notifyPaidButcherOrder(fulfillment.butcherOrder);
          } else {
            await this.notifications.notifyUser({
              userId,
              type: 'system',
              titleAr: '✅ تم الدفع بنجاح',
              bodyAr: `تم تأكيد دفعتك — رقم العملية: ${niTxId}`,
              data: { paymentId, transactionId: niTxId },
            });
          }

          this.logger.info(
            { paymentId, orderRef, state },
            'Payment synced → paid',
          );
        }
        return {
          paymentId,
          status: 'paid',
          outcome: 'success',
          synced: fulfillment.processed,
          niState: state,
          messageAr: niOrderStateLabelAr('success'),
          butcherOrder: fulfillment.butcherOrder
            ? {
                id: fulfillment.butcherOrder.id,
                orderNumber: fulfillment.butcherOrder.orderNumber,
                butcherId: fulfillment.butcherOrder.butcherId,
                paymentStatus: 'paid',
                status: 'pending',
              }
            : undefined,
          boost: fulfillment.boost
            ? {
                boostType: fulfillment.boost.boostType,
                expiresAt: fulfillment.boost.expiresAt.toISOString(),
                listingId: fulfillment.boost.listingId,
              }
            : undefined,
          promotion: fulfillment.promotion
            ? {
                expiresAt: fulfillment.promotion.expiresAt.toISOString(),
                listingId: fulfillment.promotion.listingId,
              }
            : undefined,
        };
      }

      if (outcome === 'failed') {
        const failed = await this.repo.markPaymentFailedById(paymentId);
        if (!failed.count) {
          this.logger.warn(
            { paymentId, orderRef, state },
            'Skipped sync failure transition — payment is not pending',
          );
          const latest = await this.repo.findPaymentByIdFull(paymentId);
          const terminalStatus = latest?.status ?? payment.status;
          return {
            paymentId,
            status: terminalStatus,
            outcome: terminalStatus === 'paid' ? 'success' : 'processing',
            synced: false,
            niState: state,
            messageAr: niOrderStateLabelAr(
              terminalStatus === 'paid' ? 'success' : 'processing',
            ),
          };
        }
        if (type === 'subscription' && targetPlanId) {
          await this.subscriptionLifecycle.notifyRenewalFailed(
            userId,
            targetPlanId,
          );
        } else {
          await this.notifications.notifyUser({
            userId,
            type: 'system',
            titleAr: '❌ لم يتم الدفع',
            bodyAr: 'لم تكتمل عملية الدفع. يرجى المحاولة مجدداً.',
            data: { paymentId },
          });
        }
        this.logger.warn(
          { paymentId, orderRef, state },
          'Payment synced → failed',
        );
        return {
          paymentId,
          status: 'failed',
          outcome: 'failed',
          synced: true,
          niState: state,
          messageAr: niOrderStateLabelAr('failed'),
        };
      }

      // STARTED / PENDING / AUTHORISED — do not fulfill; wait for webhook or retry sync
      return {
        paymentId,
        status: 'pending',
        outcome: 'processing',
        synced: false,
        niState: state,
        messageAr: niOrderStateLabelAr('processing'),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        { err: message, paymentId, orderRef },
        'NI sync API error',
      );
      Sentry.captureException(err);
      throwApi(502, 'sync_error', 'تعذر الاتصال ببوابة الدفع للتحقق من الحالة');
    }
  }

  /** Local/sandbox only: mark a pending payment as paid without NI webhook. */
  async simulateDevPayment(user: JwtPayload, paymentId: string) {
    if (!isNiSandboxMockMode()) {
      throwApi(403, 'forbidden', 'غير متاح في بيئة الإنتاج');
    }

    const payment = await this.repo.findPaymentOwnedByUser(
      paymentId,
      user.userId,
    );
    if (!payment) throwApi(404, 'not_found', 'الدفعة غير موجودة');
    if (payment.status === 'paid') {
      return { paymentId: payment.id, status: 'paid' as const };
    }
    if (payment.status !== 'pending') {
      throwApi(400, 'invalid_status', 'لا يمكن إتمام هذه الدفعة');
    }

    const storedMeta = (payment.metadata ?? {}) as Record<string, unknown>;
    const type =
      payment.referenceType ?? (storedMeta.type as string | undefined);
    const referenceId =
      payment.referenceId ?? (storedMeta.referenceId as string | undefined);
    const niTransactionId = `DEV-${payment.orderId}`;

    const fulfillment = await this.repo.processSuccessfulPayment({
      paymentId: payment.id,
      niTransactionId,
      type,
      referenceId,
      userId: user.userId,
      targetPlanId: storedMeta.targetPlanId as string | undefined,
      billingCycle:
        (storedMeta.billingCycle as string | undefined) ?? 'monthly',
      storedMeta,
    });

    if (fulfillment.processed && fulfillment.butcherOrder) {
      await this.notifyPaidButcherOrder(fulfillment.butcherOrder);
    }

    return {
      paymentId: payment.id,
      status: 'paid' as const,
      butcherOrder: fulfillment.butcherOrder
        ? {
            id: fulfillment.butcherOrder.id,
            orderNumber: fulfillment.butcherOrder.orderNumber,
            butcherId: fulfillment.butcherOrder.butcherId,
            paymentStatus: 'paid' as const,
            status: 'pending' as const,
          }
        : undefined,
    };
  }
}
