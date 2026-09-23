import { Injectable } from '@nestjs/common';
import {
  createNiCheckout,
  fetchNiOrder,
  isInternalMerchantOrderReference,
  isNiOrderUuid,
  type NiLogFn,
} from '../../../payments/ni-client';
import { LoggerService } from '../../../common/services/logger.service';
import { redactSensitive } from '../../utils/redact.util';
import { assertNiFetchUuid } from '../../utils/checkout-validation.util';
import type {
  PaymentGateway,
  PaymentGatewayCreateInput,
  PaymentGatewayCreateResult,
} from '../../interfaces/payment-gateway.interface';

@Injectable()
export class NiGatewayAdapter implements PaymentGateway {
  readonly provider = 'ni' as const;

  constructor(private readonly logger: LoggerService) {}

  private log: NiLogFn = (event, data) => {
    this.logger.info(
      { niEvent: event, ...(redactSensitive(data) as object) },
      `NI ${event}`,
    );
  };

  async createCheckout(
    input: PaymentGatewayCreateInput,
  ): Promise<PaymentGatewayCreateResult> {
    if (!input.merchantOrderReference?.trim()) {
      throw new Error('merchantOrderReference is required');
    }
    if (isNiOrderUuid(input.merchantOrderReference)) {
      this.logger.warn(
        { merchantOrderReference: input.merchantOrderReference },
        'Merchant reference is UUID-shaped; still sent only as merchantOrderReference, never as GET /orders/{uuid}',
      );
    }
    if (isInternalMerchantOrderReference(input.merchantOrderReference)) {
      this.logger.info(
        { merchantOrderReference: input.merchantOrderReference },
        'Using Sarh internal ref as NI merchantOrderReference only',
      );
    }

    const result = await createNiCheckout(
      {
        amount: input.amount,
        currency: input.currency,
        orderReference: input.merchantOrderReference,
        description: input.description,
        redirectUrl: input.redirectUrl,
        cancelUrl: input.cancelUrl,
        firstName: input.firstName,
        email: input.email,
        customData: input.customData,
      },
      this.log,
    );

    if (!isNiOrderUuid(result.niOrderReference)) {
      throw new Error(
        `NI create returned non-UUID order reference: ${result.niOrderReference}`,
      );
    }

    return {
      checkoutUrl: result.checkoutUrl,
      externalOrderId: result.niOrderReference,
      raw: {
        checkoutUrl: result.checkoutUrl,
        niOrderReference: result.niOrderReference,
      },
    };
  }

  async fetchOrder(externalOrderId: string): Promise<Record<string, unknown>> {
    assertNiFetchUuid(externalOrderId);
    const data = await fetchNiOrder(externalOrderId, this.log);
    return (data ?? {}) as Record<string, unknown>;
  }
}
