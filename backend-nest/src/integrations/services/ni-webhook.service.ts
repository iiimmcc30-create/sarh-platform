import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { IntegrationProvider, Prisma } from '@prisma/client';
import crypto from 'crypto';
import { LoggerService } from '../../common/services/logger.service';
import { PaymentsService } from '../../payments/payments.service';
import { isNiOrderUuid } from '../../payments/ni-client';
import { IntegrationOrdersRepository } from '../repositories/integration-orders.repository';
import { webhookEventKey } from '../utils/event-key.util';
import { redactSensitive } from '../utils/redact.util';

@Injectable()
export class NiWebhookService {
  constructor(
    private readonly repo: IntegrationOrdersRepository,
    @Inject(forwardRef(() => PaymentsService))
    private readonly payments: PaymentsService,
    private readonly logger: LoggerService,
  ) {}

  verifySignature(
    rawBody: string,
    signature: string | undefined,
  ): { ok: true } | { ok: false; status: number; error: string } {
    return this.payments.verifyWebhookSignature(rawBody, signature);
  }

  async handleRaw(rawBody: string): Promise<{
    status: number;
    body: Record<string, unknown>;
    duplicate?: boolean;
  }> {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return { status: 400, body: { error: 'invalid_json' } };
    }

    const eventName = String(event.eventName ?? event.type ?? '');
    const eventKey = webhookEventKey('ni', eventName, event);
    const redactedPayload = redactSensitive(event) as Prisma.InputJsonValue;

    let eventId: string | null = null;
    let isDuplicateAck = false;

    try {
      const inserted = await this.repo.tryInsertWebhookEvent({
        provider: IntegrationProvider.ni,
        eventKey,
        eventName,
        payload: redactedPayload,
      });
      eventId = inserted.id;
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr.code !== 'P2002') {
        this.logger.error(
          {
            err: err instanceof Error ? err.message : String(err),
            eventName,
          },
          'NI integration webhook insert failed',
        );
        return { status: 500, body: { error: 'webhook_processing_failed' } };
      }

      const existing = await this.repo.findWebhookEvent(
        IntegrationProvider.ni,
        eventKey,
      );
      if (existing?.processed) {
        this.logger.info(
          { eventKey, eventName },
          'Duplicate NI webhook ignored (already processed)',
        );
        return {
          status: 200,
          body: { received: true, duplicate: true },
          duplicate: true,
        };
      }

      // Prior insert succeeded but processing failed — retry fulfillment.
      if (!existing) {
        this.logger.error(
          { eventKey, eventName },
          'NI webhook unique conflict without existing row',
        );
        return { status: 500, body: { error: 'webhook_processing_failed' } };
      }
      eventId = existing.id;
      isDuplicateAck = false;
      this.logger.warn(
        { eventKey, eventName, eventId },
        'Reprocessing NI webhook that was not marked processed',
      );
    }

    try {
      const result = await this.payments.processWebhook(rawBody);
      const order = (event.order ?? event) as Record<string, unknown>;
      const niUuid =
        typeof order.reference === 'string' && isNiOrderUuid(order.reference)
          ? order.reference
          : null;
      if (niUuid) {
        const integration = await this.repo.findByExternalOrderId(niUuid);
        await this.repo.markWebhookProcessed(eventId!, integration?.paymentId);
      } else {
        await this.repo.markWebhookProcessed(eventId!);
      }
      return { ...result, duplicate: isDuplicateAck };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.repo
        .markWebhookError(eventId!, message)
        .catch(() => undefined);
      this.logger.error(
        { err: message, eventName, eventId },
        'NI integration webhook failed',
      );
      return { status: 500, body: { error: 'webhook_processing_failed' } };
    }
  }

  hashBody(rawBody: string): string {
    return crypto.createHash('sha256').update(rawBody).digest('hex');
  }
}
