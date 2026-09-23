import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../common/services/logger.service';
import { throwApi } from '../../common/exceptions/api.exception';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { SupportRepository } from '../repositories/support.repository';
import { SupportNotificationsService } from './support-notifications.service';
import { SocketEmitService } from '../../gateway/services/socket-emit.service';
import { SarhanSupportService } from '../ai/sarhan-support.service';
import { SupportAiContextService } from '../ai/support-ai-context.service';
import type {
  CreateSupportTicketDto,
  ReplySupportTicketDto,
} from '../dto/support.dto';
import {
  firstNameFromUser,
  sarhanWelcome,
  SUPPORT_TICKET_CATEGORY_LABEL_AR,
  TICKET_STATUS_LABEL_AR,
} from '../constants/support.constants';

const TICKET_STATUSES = [
  'OPEN',
  'IN_REVIEW',
  'AI_ASSISTING',
  'WAITING_FOR_CUSTOMER',
  'WAITING_FOR_SUPPORT',
  'IN_PROGRESS',
  'AWAITING_USER',
  'RESOLVED',
  'CLOSED',
] as const;

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.string().optional(),
});

const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.string().optional(),
  statusGroup: z
    .enum([
      'all',
      'open',
      'waiting_support',
      'in_progress',
      'resolved',
      'closed',
    ])
    .optional(),
  category: z.string().optional(),
  type: z.enum(['SUPPORT', 'REPORT']).optional(),
});

const adminUpdateTicketSchema = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    adminNotes: z.string().optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
    assignedToId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'empty_update' });

const adminReplySchema = z.object({
  body: z.string().min(1).max(5000),
  isInternal: z.boolean().optional(),
  attachments: z
    .array(
      z.object({
        fileUrl: z.string().url(),
        fileName: z.string().optional(),
        mimeType: z.string().optional(),
        fileSizeBytes: z.number().int().optional(),
      }),
    )
    .max(8)
    .optional(),
});

function asMeta(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

const HUMAN_TAKEOVER_STATUSES = new Set([
  'WAITING_FOR_SUPPORT',
  'IN_PROGRESS',
  'IN_REVIEW',
  'RESOLVED',
  'CLOSED',
]);

@Injectable()
export class SupportTicketsService {
  constructor(
    private readonly repo: SupportRepository,
    private readonly notifications: SupportNotificationsService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly sockets: SocketEmitService,
    private readonly sarhan: SarhanSupportService,
    private readonly aiContext: SupportAiContextService,
  ) {}

  private legacyTicketNumber() {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `SUP-${stamp}-${rand}`;
  }

  private async nextSrhTicketNumber(): Promise<string> {
    const year = new Date().getUTCFullYear();
    const prefix = `SRH-${year}-`;
    const latest = await this.repo.findLatestSrhTicketNumber(year);
    let seq = 1;
    const match = latest?.ticketNumber.match(/^SRH-\d{4}-(\d+)$/);
    if (match) seq = Number(match[1]) + 1;
    return `${prefix}${String(seq).padStart(6, '0')}`;
  }

  getMeta() {
    return {
      categories: Object.entries(SUPPORT_TICKET_CATEGORY_LABEL_AR).map(
        ([value, labelAr]) => ({ value, labelAr }),
      ),
      statuses: Object.entries(TICKET_STATUS_LABEL_AR).map(
        ([value, labelAr]) => ({
          value,
          labelAr,
        }),
      ),
      helpKinds: [
        { value: 'ORDER_HELP', labelAr: 'مشكلة في الطلب' },
        { value: 'OTHER_HELP', labelAr: 'مساعدة في شيء آخر' },
      ],
    };
  }

  isStaffRole(role: string): boolean {
    return role === 'ADMIN' || role === 'MODERATOR';
  }

  async listUserTickets(user: JwtPayload, query: Record<string, unknown>) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) throwApi(400, 'invalid_query', 'معاملات غير صالحة');
    const { page, pageSize, status } = parsed.data;
    return this.repo.listUserTickets(user.userId, page, pageSize, status);
  }

  async listHelpOrders(user: JwtPayload) {
    const orders = await this.repo.listCustomerHelpOrders(user.userId);
    return { orders };
  }

  async getUserTicket(user: JwtPayload, id: string) {
    const ticket = await this.repo.findUserTicket(id, user.userId);
    if (!ticket) throwApi(404, 'not_found', 'التذكرة غير موجودة');
    return { ticket };
  }

  async getTicketForSocket(user: JwtPayload, ticketId: string) {
    if (this.isStaffRole(user.role)) {
      return this.repo.findTicketById(ticketId);
    }
    return this.repo.findUserTicket(ticketId, user.userId);
  }

  async createTicket(user: JwtPayload, dto: CreateSupportTicketDto) {
    const helpKind = dto.helpKind;
    if (helpKind === 'ORDER_HELP' || helpKind === 'OTHER_HELP') {
      return this.createHelpTicket(user, dto);
    }
    if (!dto.category || !dto.subject) {
      throwApi(400, 'invalid_body', 'بيانات غير صالحة');
    }
    if (dto.description.trim().length < 10) {
      throwApi(400, 'invalid_body', 'الوصف قصير جداً');
    }

    const ticket = await this.repo.createTicket({
      ticketNumber: this.legacyTicketNumber(),
      type: 'SUPPORT',
      category: dto.category,
      subject: dto.subject.trim(),
      description: dto.description.trim(),
      status: 'OPEN',
      handlerMode: 'HUMAN_ACTIVE',
      reporter: { connect: { id: user.userId } },
      attachments: dto.attachments?.length
        ? {
            create: dto.attachments.map((a) => ({
              fileUrl: a.fileUrl,
              fileName: a.fileName,
              mimeType: a.mimeType,
              fileSizeBytes: a.fileSizeBytes,
            })),
          }
        : undefined,
    });

    this.logger.info(
      { event: 'TICKET_CREATED', ticketNumber: ticket.ticketNumber },
      'Support ticket created',
    );

    await this.notifications.notifyTicketCreated(user.userId, {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
    });

    return {
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        createdAt: ticket.createdAt,
      },
    };
  }

  private async createHelpTicket(
    user: JwtPayload,
    dto: CreateSupportTicketDto,
  ) {
    const helpKind = dto.helpKind!;
    const description = dto.description.trim();
    let orderId: string | null = null;

    if (helpKind === 'ORDER_HELP') {
      if (!dto.orderId) {
        throwApi(400, 'order_required', 'يجب اختيار طلب');
      }
      const owned = await this.repo.findOwnedButcherOrder(
        dto.orderId,
        user.userId,
      );
      if (!owned) {
        const exists = await this.repo.findButcherOrderById(dto.orderId);
        if (exists) {
          throwApi(403, 'forbidden', 'لا يمكنك فتح بلاغ على طلب لا يخصك');
        }
        throwApi(404, 'not_found', 'الطلب غير موجود');
      }
      orderId = owned.id;
    }

    const names = await this.repo.findUserNames(user.userId);
    const firstName = firstNameFromUser(names ?? {});
    const storedCategory =
      helpKind === 'ORDER_HELP'
        ? 'ORDER_HELP'
        : dto.category && dto.category !== 'ORDER_HELP'
          ? dto.category
          : 'OTHER_HELP';
    const subject =
      SUPPORT_TICKET_CATEGORY_LABEL_AR[
        storedCategory as keyof typeof SUPPORT_TICKET_CATEGORY_LABEL_AR
      ] ?? (helpKind === 'ORDER_HELP' ? 'مشكلة في الطلب' : 'مساعدة في شيء آخر');

    let ticket: Awaited<ReturnType<SupportRepository['createTicket']>> | null =
      null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const ticketNumber = await this.nextSrhTicketNumber();
      try {
        ticket = await this.repo.createTicket({
          ticketNumber,
          type: 'SUPPORT',
          category: storedCategory,
          subject,
          description,
          status: 'AI_ASSISTING',
          handlerMode: 'AI_ACTIVE',
          reporter: { connect: { id: user.userId } },
          ...(orderId ? { order: { connect: { id: orderId } } } : {}),
          metadata: {
            issueType: 'OTHER',
            customerDescription: description,
            selectedCategory: storedCategory,
            missingInformation: [],
          } as Prisma.InputJsonValue,
        });
        break;
      } catch (err) {
        if (this.repo.isUniqueConstraint(err) && attempt < 7) continue;
        throw err;
      }
    }
    if (!ticket) throwApi(500, 'ticket_create_failed', 'تعذر إنشاء البلاغ');

    await this.repo.createMessage({
      ticket: { connect: { id: ticket.id } },
      authorKind: 'SARHAN',
      isStaffReply: true,
      body: sarhanWelcome(firstName, subject),
    });

    await this.repo.createMessage({
      ticket: { connect: { id: ticket.id } },
      author: { connect: { id: user.userId } },
      authorKind: 'CUSTOMER',
      isStaffReply: false,
      body: description,
    });

    this.logger.info(
      { event: 'TICKET_CREATED', ticketNumber: ticket.ticketNumber },
      'Help ticket created',
    );

    await this.notifications.notifyTicketCreated(user.userId, {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
    });

    await this.runSarhanIfActive(ticket.id);

    const fresh = await this.repo.findUserTicket(ticket.id, user.userId);
    this.emitTicket(ticket.id, 'support:message', {
      ticketId: ticket.id,
      ticket: fresh,
    });

    return {
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: fresh?.status ?? ticket.status,
        handlerMode: fresh?.handlerMode ?? ticket.handlerMode,
        createdAt: ticket.createdAt,
      },
    };
  }

  async replyAsUser(
    user: JwtPayload,
    ticketId: string,
    dto: ReplySupportTicketDto,
  ) {
    const ticket = await this.repo.findUserTicket(ticketId, user.userId);
    if (!ticket) throwApi(404, 'not_found', 'التذكرة غير موجودة');
    if (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED') {
      throwApi(400, 'ticket_closed', 'لا يمكن الرد على تذكرة مغلقة');
    }

    const message = await this.repo.createMessage({
      ticket: { connect: { id: ticketId } },
      author: { connect: { id: user.userId } },
      authorKind: 'CUSTOMER',
      body: dto.body.trim(),
      isStaffReply: false,
      attachments: dto.attachments?.length
        ? {
            create: dto.attachments.map((a) => ({
              fileUrl: a.fileUrl,
              fileName: a.fileName,
              mimeType: a.mimeType,
              fileSizeBytes: a.fileSizeBytes,
              ticket: { connect: { id: ticketId } },
            })),
          }
        : undefined,
    });

    let nextStatus = ticket.status;
    if (ticket.handlerMode === 'HUMAN_ACTIVE') {
      if (
        ticket.status === 'AWAITING_USER' ||
        ticket.status === 'WAITING_FOR_CUSTOMER'
      ) {
        nextStatus = 'WAITING_FOR_SUPPORT';
      }
    }

    const updated = await this.repo.updateTicket(ticketId, {
      status: nextStatus,
    });

    await this.notifications.notifyUserReply({
      id: updated.id,
      ticketNumber: updated.ticketNumber,
      subject: updated.subject,
    });

    this.emitTicket(ticketId, 'support:message', {
      ticketId,
      message,
    });

    if (ticket.handlerMode === 'AI_ACTIVE') {
      await this.runSarhanIfActive(ticketId);
    }

    const fresh = await this.repo.findUserTicket(ticketId, user.userId);
    return { message, ticket: fresh ?? updated };
  }

  async listAdminTickets(query: Record<string, unknown>) {
    const parsed = adminListQuerySchema.safeParse(query);
    if (!parsed.success) throwApi(400, 'invalid_query', 'معاملات غير صالحة');
    return this.repo.listAdminTickets(parsed.data);
  }

  async getAdminTicket(id: string) {
    const ticket = await this.repo.findTicketById(id);
    if (!ticket) throwApi(404, 'not_found', 'التذكرة غير موجودة');
    return { ticket };
  }

  async updateAdminTicket(
    staff: JwtPayload,
    id: string,
    body: Record<string, unknown>,
  ) {
    const parsed = adminUpdateTicketSchema.safeParse(body);
    if (!parsed.success) throwApi(400, 'invalid_body', 'بيانات غير صالحة');

    const existing = await this.repo.findTicketById(id);
    if (!existing) throwApi(404, 'not_found', 'التذكرة غير موجودة');

    const closedAt =
      parsed.data.status === 'CLOSED' || parsed.data.status === 'RESOLVED'
        ? new Date()
        : parsed.data.status
          ? null
          : undefined;

    const ticket = await this.repo.updateTicket(id, {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.adminNotes !== undefined
        ? { adminNotes: parsed.data.adminNotes }
        : {}),
      ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
      ...(parsed.data.assignedToId !== undefined
        ? {
            assignedTo:
              parsed.data.assignedToId === null
                ? { disconnect: true }
                : { connect: { id: parsed.data.assignedToId } },
          }
        : {}),
      ...(closedAt !== undefined ? { closedAt } : {}),
      ...(parsed.data.assignedToId ||
      (parsed.data.status && HUMAN_TAKEOVER_STATUSES.has(parsed.data.status))
        ? { handlerMode: 'HUMAN_ACTIVE' as const }
        : {}),
    });

    if (
      parsed.data.assignedToId &&
      parsed.data.assignedToId !== existing.assignedToId
    ) {
      this.logger.info(
        {
          event: 'SUPPORT_ASSIGNED',
          ticketNumber: ticket.ticketNumber,
          actorId: staff.userId,
        },
        'Support ticket assigned',
      );
    }
    if (parsed.data.status === 'RESOLVED') {
      this.logger.info(
        { event: 'TICKET_RESOLVED', ticketNumber: ticket.ticketNumber },
        'Support ticket resolved',
      );
    }
    if (parsed.data.status === 'CLOSED') {
      this.logger.info(
        { event: 'TICKET_CLOSED', ticketNumber: ticket.ticketNumber },
        'Support ticket closed',
      );
    }

    if (
      existing.reporterId &&
      parsed.data.status &&
      parsed.data.status !== existing.status
    ) {
      if (
        parsed.data.status === 'AWAITING_USER' ||
        parsed.data.status === 'WAITING_FOR_CUSTOMER'
      ) {
        await this.notifications.notifyTicketAwaitingUser(existing.reporterId, {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
        });
      } else if (parsed.data.status === 'CLOSED') {
        await this.notifications.notifyTicketClosed(existing.reporterId, {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
        });
      } else {
        await this.notifications.notifyTicketStatusChanged(
          existing.reporterId,
          {
            id: ticket.id,
            ticketNumber: ticket.ticketNumber,
            status: parsed.data.status,
          },
        );
      }
    }

    return { ticket };
  }

  async replyAsStaff(
    staff: JwtPayload,
    ticketId: string,
    body: Record<string, unknown>,
  ) {
    const parsed = adminReplySchema.safeParse(body);
    if (!parsed.success) throwApi(400, 'invalid_body', 'بيانات غير صالحة');

    const ticket = await this.repo.findTicketById(ticketId);
    if (!ticket) throwApi(404, 'not_found', 'التذكرة غير موجودة');

    if (parsed.data.isInternal) {
      const mergedNotes = [ticket.adminNotes, parsed.data.body.trim()]
        .filter(Boolean)
        .join('\n\n');
      const updated = await this.repo.updateTicket(ticketId, {
        adminNotes: mergedNotes,
      });
      return { ticket: updated, internal: true };
    }

    const message = await this.repo.createMessage({
      ticket: { connect: { id: ticketId } },
      author: { connect: { id: staff.userId } },
      authorKind: 'STAFF',
      body: parsed.data.body.trim(),
      isStaffReply: true,
      attachments: parsed.data.attachments?.length
        ? {
            create: parsed.data.attachments.map((a) => ({
              fileUrl: a.fileUrl,
              fileName: a.fileName,
              mimeType: a.mimeType,
              fileSizeBytes: a.fileSizeBytes,
              ticket: { connect: { id: ticketId } },
            })),
          }
        : undefined,
    });

    const updated = await this.repo.updateTicket(ticketId, {
      status: 'IN_PROGRESS',
      handlerMode: 'HUMAN_ACTIVE',
    });

    this.logger.info(
      { event: 'SUPPORT_REPLIED', ticketNumber: updated.ticketNumber },
      'Support staff replied',
    );

    if (ticket.reporterId) {
      await this.notifications.notifyStaffReply(ticket.reporterId, {
        id: updated.id,
        ticketNumber: updated.ticketNumber,
      });
    }

    this.emitTicket(ticketId, 'support:message', {
      ticketId,
      message,
    });

    return { message, ticket: updated };
  }

  async listAssignableStaff() {
    const staff = await this.repo.findAllStaffUserIds();
    const users = await this.prisma.user.findMany({
      take: Math.max(staff.length, 1),
      where: { id: { in: staff.map((s) => s.id) } },
      select: {
        id: true,
        username: true,
        displayName: true,
        arabicName: true,
        role: true,
      },
    });
    return { staff: users };
  }

  private emitTicket(ticketId: string, event: string, data: unknown) {
    this.sockets.emitToTicket(ticketId, event, data);
  }

  private async runSarhanIfActive(ticketId: string) {
    const ticket = await this.repo.findTicketById(ticketId);
    if (!ticket || ticket.handlerMode !== 'AI_ACTIVE') return;
    if (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED') return;

    const context = await this.aiContext.build(ticket);
    const existingMeta = asMeta(ticket.metadata);
    const turn = await this.sarhan.nextTurn(context, existingMeta);

    await this.repo.createMessage({
      ticket: { connect: { id: ticket.id } },
      authorKind: 'SARHAN',
      isStaffReply: true,
      body: turn.replyAr,
    });

    await this.repo.updateTicket(ticket.id, {
      metadata: turn.metadata as Prisma.InputJsonValue,
      ...(turn.escalate
        ? {
            status: 'WAITING_FOR_SUPPORT' as const,
            handlerMode: 'HUMAN_ACTIVE' as const,
          }
        : {
            status: 'WAITING_FOR_CUSTOMER' as const,
          }),
    });

    if (turn.escalate) {
      this.logger.info(
        { event: 'AI_ESCALATED', ticketNumber: ticket.ticketNumber },
        'Sarhan escalated ticket',
      );
    }

    this.emitTicket(ticket.id, 'support:message', {
      ticketId: ticket.id,
      authorKind: 'SARHAN',
      body: turn.replyAr,
    });
  }
}
