import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { firstNameFromUser } from '../constants/support.constants';
import type { SupportAiContext, SupportAiOrderContext } from './ai-provider';

type TicketRow = {
  ticketNumber: string;
  category: string;
  description: string;
  reporterId: string | null;
  orderId: string | null;
  metadata: unknown;
  reporter?: {
    arabicName?: string | null;
    displayName?: string | null;
  } | null;
  messages?: Array<{ authorKind?: string; body: string }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

@Injectable()
export class SupportAiContextService {
  constructor(private readonly prisma: PrismaService) {}

  async build(ticket: TicketRow): Promise<SupportAiContext> {
    const meta = asRecord(ticket.metadata);
    const reporter =
      ticket.reporter ??
      (ticket.reporterId
        ? await this.prisma.user.findUnique({
            where: { id: ticket.reporterId },
            select: { arabicName: true, displayName: true },
          })
        : null);

    const order = await this.loadOwnedOrder(ticket.reporterId, ticket.orderId);

    return {
      ticketNumber: ticket.ticketNumber,
      category: ticket.category,
      customerFirstName: firstNameFromUser(reporter ?? {}),
      customerDescription: ticket.description,
      issueType: typeof meta.issueType === 'string' ? meta.issueType : null,
      summary: typeof meta.summary === 'string' ? meta.summary : null,
      missingInformation: Array.isArray(meta.missingInformation)
        ? meta.missingInformation.map(String)
        : [],
      recentMessages: (ticket.messages ?? []).slice(-12).map((m) => ({
        authorKind: m.authorKind || 'CUSTOMER',
        body: m.body.slice(0, 800),
      })),
      order,
    };
  }

  private async loadOwnedOrder(
    reporterId: string | null,
    orderId: string | null,
  ): Promise<SupportAiOrderContext | null> {
    if (!reporterId || !orderId) return null;

    const order = await this.prisma.butcherOrder.findFirst({
      where: { id: orderId, customerId: reporterId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        totalPrice: true,
        currency: true,
        createdAt: true,
        deliveryType: true,
        deliveryAddress: true,
        items: {
          select: {
            cutType: true,
            weightKg: true,
            linePrice: true,
            product: { select: { nameAr: true } },
          },
        },
      },
    });
    if (!order) return null;

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalPrice: order.totalPrice,
      currency: order.currency,
      createdAt: order.createdAt.toISOString(),
      deliveryType: order.deliveryType,
      deliveryAddress: order.deliveryAddress,
      items: order.items.map((item) => ({
        nameAr: item.product?.nameAr ?? null,
        cutType: item.cutType,
        weightKg: item.weightKg,
        linePrice: item.linePrice,
      })),
    };
  }
}
