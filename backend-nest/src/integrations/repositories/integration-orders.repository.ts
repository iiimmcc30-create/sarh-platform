import { Injectable } from '@nestjs/common';
import { IntegrationProvider, IntegrationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IntegrationOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByPaymentId(paymentId: string) {
    return this.prisma.integrationOrder.findUnique({ where: { paymentId } });
  }

  findById(id: string) {
    return this.prisma.integrationOrder.findUnique({
      where: { id },
      include: {
        payment: {
          select: {
            id: true,
            orderId: true,
            status: true,
            amount: true,
            currency: true,
            transactionId: true,
            referenceType: true,
            referenceId: true,
            createdAt: true,
          },
        },
      },
    });
  }

  findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.integrationOrder.findUnique({
      where: { idempotencyKey },
    });
  }

  findByExternalOrderId(externalOrderId: string) {
    return this.prisma.integrationOrder.findFirst({
      where: { externalOrderId },
    });
  }

  list(params: { skip: number; take: number; status?: IntegrationStatus }) {
    const where = params.status ? { status: params.status } : {};
    return Promise.all([
      this.prisma.integrationOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
        include: {
          payment: {
            select: {
              id: true,
              orderId: true,
              status: true,
              amount: true,
              currency: true,
              method: true,
              referenceType: true,
              transactionId: true,
              metadata: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  arabicName: true,
                  displayName: true,
                  phone: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.integrationOrder.count({ where }),
    ]);
  }

  upsertPending(data: {
    paymentId: string;
    merchantOrderReference: string;
    idempotencyKey: string;
    requestPayload: Prisma.InputJsonValue;
  }) {
    return this.prisma.integrationOrder.upsert({
      where: { paymentId: data.paymentId },
      create: {
        paymentId: data.paymentId,
        provider: IntegrationProvider.ni,
        status: IntegrationStatus.pending,
        merchantOrderReference: data.merchantOrderReference,
        idempotencyKey: data.idempotencyKey,
        requestPayload: data.requestPayload,
      },
      update: {
        merchantOrderReference: data.merchantOrderReference,
        requestPayload: data.requestPayload,
        lastError: null,
      },
    });
  }

  markProcessing(id: string, retryCount: number) {
    return this.prisma.integrationOrder.update({
      where: { id },
      data: {
        status:
          retryCount > 0
            ? IntegrationStatus.retrying
            : IntegrationStatus.processing,
        lastAttemptAt: new Date(),
        retryCount,
      },
    });
  }

  markSynced(
    id: string,
    data: {
      externalOrderId: string;
      checkoutUrl: string;
      responsePayload: Prisma.InputJsonValue;
    },
  ) {
    return this.prisma.integrationOrder.update({
      where: { id },
      data: {
        status: IntegrationStatus.synced,
        externalOrderId: data.externalOrderId,
        externalReference: data.externalOrderId,
        checkoutUrl: data.checkoutUrl,
        responsePayload: data.responsePayload,
        lastError: null,
        syncedAt: new Date(),
      },
    });
  }

  markFailed(
    id: string,
    lastError: string,
    responsePayload?: Prisma.InputJsonValue,
  ) {
    return this.prisma.integrationOrder.update({
      where: { id },
      data: {
        status: IntegrationStatus.failed,
        lastError,
        ...(responsePayload ? { responsePayload } : {}),
      },
    });
  }

  tryInsertWebhookEvent(data: {
    provider: IntegrationProvider;
    eventKey: string;
    eventName?: string;
    payload: Prisma.InputJsonValue;
    paymentId?: string;
  }) {
    return this.prisma.integrationWebhookEvent.create({ data });
  }

  findWebhookEvent(provider: IntegrationProvider, eventKey: string) {
    return this.prisma.integrationWebhookEvent.findUnique({
      where: { provider_eventKey: { provider, eventKey } },
    });
  }

  markWebhookProcessed(id: string, paymentId?: string) {
    return this.prisma.integrationWebhookEvent.update({
      where: { id },
      data: { processed: true, paymentId, lastError: null },
    });
  }

  markWebhookError(id: string, lastError: string) {
    return this.prisma.integrationWebhookEvent.update({
      where: { id },
      data: { lastError, processed: false },
    });
  }
}
