import { Inject, Injectable } from '@nestjs/common';
import { IntegrationStatus, Prisma } from '@prisma/client';
import { LoggerService } from '../../common/services/logger.service';
import { throwApi } from '../../common/exceptions/api.exception';
import {
  formatNiGatewayError,
  isInternalMerchantOrderReference,
  isNiOrderUuid,
  isNiSandboxMockMode,
  NiGatewayError,
} from '../../payments/ni-client';
import { NI_IDEMPOTENCY_PREFIX } from '../constants/integration.constants';
import { CreateHostedCheckoutDto } from '../dto/create-hosted-checkout.dto';
import {
  PAYMENT_GATEWAY,
  type HostedCheckoutResult,
  type PaymentGateway,
} from '../interfaces/payment-gateway.interface';
import { IntegrationOrdersRepository } from '../repositories/integration-orders.repository';
import { validateCheckoutCommand } from '../utils/checkout-validation.util';
import { maskEmail, redactSensitive } from '../utils/redact.util';

@Injectable()
export class IntegrationCheckoutService {
  constructor(
    private readonly repo: IntegrationOrdersRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly logger: LoggerService,
  ) {}

  async createHostedCheckout(
    input: CreateHostedCheckoutDto,
  ): Promise<HostedCheckoutResult> {
    const errors = validateCheckoutCommand(input);
    if (errors.length) {
      throwApi(400, 'integration_validation', errors.join('; '));
    }

    const merchantOrderReference = input.merchantOrderReference.trim();
    const currency = (input.currency || 'SAR').toUpperCase();
    const idempotencyKey = `${NI_IDEMPOTENCY_PREFIX}:${input.paymentId}`;

    const existing =
      (await this.repo.findByPaymentId(input.paymentId)) ??
      (await this.repo.findByIdempotencyKey(idempotencyKey));

    if (
      existing?.checkoutUrl &&
      (isNiOrderUuid(existing.externalOrderId) ||
        existing.externalOrderId?.startsWith('DEV-'))
    ) {
      this.logger.info(
        {
          paymentId: input.paymentId,
          integrationOrderId: existing.id,
          externalOrderId: existing.externalOrderId,
        },
        'Reusing existing NI checkout (idempotent)',
      );
      return {
        checkoutUrl: existing.checkoutUrl,
        externalOrderId: existing.externalOrderId as string,
        merchantOrderReference: existing.merchantOrderReference,
        reused: true,
        mock: isNiSandboxMockMode(),
      };
    }

    const requestPayload = redactSensitive({
      merchantOrderReference,
      amount: input.amount,
      currency,
      description: input.description,
      redirectUrl: input.redirectUrl,
      cancelUrl: input.cancelUrl,
      email: maskEmail(input.email),
      customData: input.customData,
    }) as Prisma.InputJsonValue;

    const row = await this.repo.upsertPending({
      paymentId: input.paymentId,
      merchantOrderReference,
      idempotencyKey,
      requestPayload,
    });

    if (isNiSandboxMockMode()) {
      const mockUrl = `https://sandbox.network.ae/demo/${merchantOrderReference}`;
      await this.repo.markSynced(row.id, {
        externalOrderId: `DEV-${merchantOrderReference}`,
        checkoutUrl: mockUrl,
        responsePayload: { mock: true },
      });
      return {
        checkoutUrl: mockUrl,
        externalOrderId: `DEV-${merchantOrderReference}`,
        merchantOrderReference,
        reused: false,
        mock: true,
      };
    }

    await this.repo.markProcessing(row.id, row.retryCount);

    try {
      const created = await this.gateway.createCheckout({
        merchantOrderReference,
        amount: input.amount,
        currency,
        description: input.description,
        redirectUrl: input.redirectUrl,
        cancelUrl: input.cancelUrl,
        firstName: input.firstName,
        email: input.email,
        customData: input.customData,
      });

      if (!isNiOrderUuid(created.externalOrderId)) {
        throw new Error(
          `Provider returned invalid order UUID: ${created.externalOrderId}`,
        );
      }

      await this.repo.markSynced(row.id, {
        externalOrderId: created.externalOrderId,
        checkoutUrl: created.checkoutUrl,
        responsePayload: redactSensitive(created.raw) as Prisma.InputJsonValue,
      });

      return {
        checkoutUrl: created.checkoutUrl,
        externalOrderId: created.externalOrderId,
        merchantOrderReference,
        reused: false,
        mock: false,
      };
    } catch (err: unknown) {
      const message = formatNiGatewayError(err);
      const body =
        err instanceof NiGatewayError
          ? (redactSensitive(err.niBody) as Prisma.InputJsonValue | undefined)
          : undefined;
      await this.repo.markFailed(row.id, message, body).catch(() => undefined);
      this.logger.error(
        {
          paymentId: input.paymentId,
          merchantOrderReference,
          err: message,
          httpStatus:
            err instanceof NiGatewayError ? err.httpStatus : undefined,
        },
        'NI hosted checkout failed — local payment preserved',
      );
      throw err;
    }
  }

  async retryFailedCheckout(
    integrationOrderId: string,
    input: Omit<
      CreateHostedCheckoutDto,
      'paymentId' | 'merchantOrderReference'
    > & {
      paymentId?: string;
    },
  ): Promise<HostedCheckoutResult> {
    const row = await this.repo.findById(integrationOrderId);
    if (!row) throwApi(404, 'not_found', 'سجل التكامل غير موجود');
    if (
      row.externalOrderId &&
      isNiOrderUuid(row.externalOrderId) &&
      row.checkoutUrl
    ) {
      return {
        checkoutUrl: row.checkoutUrl,
        externalOrderId: row.externalOrderId,
        merchantOrderReference: row.merchantOrderReference,
        reused: true,
        mock: isNiSandboxMockMode(),
      };
    }
    if (row.status === IntegrationStatus.synced && row.checkoutUrl) {
      throwApi(409, 'already_synced', 'طلب التكامل مكتمل مسبقاً');
    }

    await this.repo.markProcessing(row.id, row.retryCount + 1);
    return this.createHostedCheckout({
      paymentId: row.paymentId,
      merchantOrderReference: row.merchantOrderReference,
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      redirectUrl: input.redirectUrl,
      cancelUrl: input.cancelUrl,
      firstName: input.firstName,
      email: input.email,
      customData: input.customData,
    });
  }

  rejectInternalRefAsUuid(value: string): void {
    if (isInternalMerchantOrderReference(value)) {
      throwApi(
        400,
        'invalid_order_reference_type',
        'لا يمكن استخدام رقم الطلب الداخلي كمرجع UUID لـ Network International',
      );
    }
  }
}
