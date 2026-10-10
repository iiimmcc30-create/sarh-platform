import { Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../common/services/logger.service';
import { throwApi } from '../../common/exceptions/api.exception';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { SupportRepository } from '../repositories/support.repository';
import { SupportNotificationsService } from './support-notifications.service';
import { SocketEmitService } from '../../gateway/services/socket-emit.service';
import { SupportSocketBridgeService } from '../../gateway/services/support-socket-bridge.service';
import {
  SarhanSupportService,
  type SarhanTurnResult,
} from '../ai/sarhan-support.service';
import { SupportAiContextService } from '../ai/support-ai-context.service';
import type {
  CreateSupportTicketDto,
  ReplySupportTicketDto,
} from '../dto/support.dto';
import {
  firstNameFromUser,
  sarhanHandoff,
  sarhanWelcome,
  SUPPORT_TICKET_CATEGORY_LABEL_AR,
  TICKET_STATUS_LABEL_AR,
} from '../constants/support.constants';
import { ticketPriorityFor } from './ticket-priority';
import { isAssistantEnabled, isCsAgentEnabled } from '../../ai-safety/ai-flags';
import { AiRuntimeFlagsService } from '../../ai-safety/ai-runtime-flags.service';
import { CsAgentService } from '../../ai-agents/cs/cs-agent.service';
import {
  FRAUD_RE,
  HUMAN_REQUEST_RE,
  JAILBREAK_RE,
  PAYMENT_DISPUTE_RE,
  REFUND_RE,
} from '../ai/support-guards';
import { withHandoffAt } from './support-handoff-clock';
import type { SupportEscalationReason } from '../ai/ai-provider';

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

const reportListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  /** open | review | closed — matches the app's three status pills. */
  state: z.enum(['open', 'review', 'closed']).optional(),
});

/** App pill groups for «بلاغاتي»: مفتوح / قيد المراجعة / مغلق. */
export const REPORT_STATE_STATUSES: Record<
  'open' | 'review' | 'closed',
  (typeof TICKET_STATUSES)[number][]
> = {
  open: ['OPEN', 'AWAITING_USER', 'WAITING_FOR_CUSTOMER'],
  review: ['IN_REVIEW', 'AI_ASSISTING', 'WAITING_FOR_SUPPORT', 'IN_PROGRESS'],
  closed: ['RESOLVED', 'CLOSED'],
};

export function reportStateFor(status: string): 'open' | 'review' | 'closed' {
  if (REPORT_STATE_STATUSES.closed.includes(status as never)) return 'closed';
  if (REPORT_STATE_STATUSES.review.includes(status as never)) return 'review';
  return 'open';
}

function lineValue(text: string | null | undefined, label: string) {
  if (!text) return null;
  for (const line of text.split('\n')) {
    if (line.startsWith(`${label}:`)) {
      const v = line.slice(label.length + 1).trim();
      return v || null;
    }
  }
  return null;
}

/** Public shape of one «بلاغاتي» row — never leaks description/notes. */
export function toUserReportRow(t: {
  id: string;
  ticketNumber: string;
  type: string;
  category: string;
  status: string;
  subject: string;
  description?: string | null;
  metadata?: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  const meta =
    t.metadata && typeof t.metadata === 'object' && !Array.isArray(t.metadata)
      ? (t.metadata as Record<string, unknown>)
      : {};
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  const isFraud = t.category === 'FRAUD';
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    kind: isFraud ? ('FRAUD' as const) : ('REPORT' as const),
    subject: t.subject,
    reason: str(meta.reason) ?? lineValue(t.description, 'السبب') ?? t.subject,
    targetType: isFraud
      ? null
      : (str(meta.targetType) ?? lineValue(t.description, 'النوع')),
    status: t.status,
    state: reportStateFor(t.status),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

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

function lastCustomerBody(ticket: {
  description?: string | null;
  messages?: Array<{ authorKind?: string | null; body?: string | null }>;
}): string {
  const messages = ticket.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.authorKind === 'CUSTOMER' && message.body?.trim()) {
      return message.body.trim();
    }
  }
  return (ticket.description ?? '').trim();
}

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
    @Optional() private readonly supportBridge?: SupportSocketBridgeService,
    @Optional() private readonly csAgent?: CsAgentService,
    @Optional() private readonly runtimeFlags?: AiRuntimeFlagsService,
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

  private async defaultPriority(userId: string, category?: string | null) {
    const tier = await this.repo.findReporterTier(userId).catch(() => null);
    return ticketPriorityFor({ verifiedTier: tier?.verifiedTier, category });
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
      helpKinds: [{ value: 'OTHER_HELP', labelAr: 'اسأل مساعد سرح' }],
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

  /** «بلاغاتي»: the caller's own REPORT tickets + FRAUD-category tickets. */
  async listUserReports(user: JwtPayload, query: Record<string, unknown>) {
    const parsed = reportListQuerySchema.safeParse(query);
    if (!parsed.success) throwApi(400, 'invalid_query', 'معاملات غير صالحة');
    const { page, pageSize, state } = parsed.data;
    const res = await this.repo.listUserReportTickets(
      user.userId,
      page,
      pageSize,
      state ? REPORT_STATE_STATUSES[state] : undefined,
    );
    return { ...res, items: res.items.map(toUserReportRow) };
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
    if (helpKind === 'OTHER_HELP') {
      return this.createHelpTicket(user, dto);
    }
    if (!dto.category || !dto.subject) {
      throwApi(400, 'invalid_body', 'بيانات غير صالحة');
    }
    if (dto.description.trim().length < 10) {
      throwApi(400, 'invalid_body', 'الوصف قصير جداً');
    }

    const priority = await this.defaultPriority(user.userId, dto.category);
    const ticket = await this.repo.createTicket({
      ticketNumber: this.legacyTicketNumber(),
      type: 'SUPPORT',
      category: dto.category,
      priority,
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
    options?: { scheduleAssistant?: boolean },
  ) {
    const description = dto.description.trim();

    const names = await this.repo.findUserNames(user.userId);
    const firstName = firstNameFromUser(names ?? {});
    const storedCategory = dto.category ?? 'OTHER_HELP';
    const subject =
      SUPPORT_TICKET_CATEGORY_LABEL_AR[
        storedCategory as keyof typeof SUPPORT_TICKET_CATEGORY_LABEL_AR
      ] ?? 'مساعدة في شيء آخر';

    const priority = await this.defaultPriority(user.userId, storedCategory);
    let ticket: Awaited<ReturnType<SupportRepository['createTicket']>> | null =
      null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const ticketNumber = await this.nextSrhTicketNumber();
      try {
        ticket = await this.repo.createTicket({
          ticketNumber,
          type: 'SUPPORT',
          category: storedCategory,
          priority,
          subject,
          description,
          status: 'AI_ASSISTING',
          handlerMode: 'AI_ACTIVE',
          reporter: { connect: { id: user.userId } },
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

    // With the assistant switched off the ticket is handed straight to the
    // human team (runSarhanIfActive below), so skip the assistant greeting.
    if (isAssistantEnabled()) {
      await this.repo.createMessage({
        ticket: { connect: { id: ticket.id } },
        authorKind: 'SARHAN',
        isStaffReply: true,
        body: sarhanWelcome(firstName, subject),
      });
    }

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

    if (options?.scheduleAssistant !== false) this.scheduleSarhan(ticket.id);

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

  /**
   * Agent path: same help-ticket insert as a customer, without scheduling
   * another assistant turn. An open ticket in the same category from the
   * last 24 hours is returned instead of creating a second one.
   */
  async createOwnedHelpTicket(
    userId: string,
    category: string,
    summary: string,
  ): Promise<{ ticketNumber: string; duplicate: boolean }> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await this.repo.findRecentOpenByCategory(
      userId,
      category,
      since,
    );
    if (existing) {
      return { ticketNumber: existing.ticketNumber, duplicate: true };
    }
    const created = await this.createHelpTicket(
      { userId, username: userId, role: 'USER' },
      {
        helpKind: 'OTHER_HELP',
        description: summary,
        category: category as CreateSupportTicketDto['category'],
      },
      { scheduleAssistant: false },
    );
    return { ticketNumber: created.ticket.ticketNumber, duplicate: false };
  }

  /** A note on a ticket this user owns. Does not start another assistant turn. */
  async addOwnedNote(
    userId: string,
    ticketNumber: string,
    body: string,
  ): Promise<{ ok: boolean; reason?: 'not_owner' | 'closed' }> {
    const ticket = await this.repo.findOwnedByNumber(userId, ticketNumber);
    if (!ticket) return { ok: false, reason: 'not_owner' };
    if (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED') {
      return { ok: false, reason: 'closed' };
    }
    const message = await this.repo.createMessage({
      ticket: { connect: { id: ticket.id } },
      author: { connect: { id: userId } },
      authorKind: 'CUSTOMER',
      body: body.trim(),
      isStaffReply: false,
    });
    let nextStatus = ticket.status;
    if (
      ticket.handlerMode === 'HUMAN_ACTIVE' &&
      (ticket.status === 'AWAITING_USER' ||
        ticket.status === 'WAITING_FOR_CUSTOMER')
    ) {
      nextStatus = 'WAITING_FOR_SUPPORT';
    }
    const updated = await this.repo.updateTicket(ticket.id, {
      status: nextStatus,
    });
    await this.notifications.notifyUserReply({
      id: updated.id,
      ticketNumber: updated.ticketNumber,
      subject: updated.subject,
    });
    this.emitTicket(ticket.id, 'support:message', {
      ticketId: ticket.id,
      message,
    });
    return { ok: true };
  }

  /** Same human handoff as the assistant: atomic claim plus the existing e-mail. */
  async handoffOwnedTicket(
    userId: string,
    ticketNumber: string,
    reason: SupportEscalationReason,
  ): Promise<{ ok: boolean; reason?: 'not_owner' | 'closed'; already?: boolean }> {
    const ticket = await this.repo.findOwnedByNumber(userId, ticketNumber);
    if (!ticket) return { ok: false, reason: 'not_owner' };
    if (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED') {
      return { ok: false, reason: 'closed' };
    }
    const claimed = await this.repo.claimHumanHandoff(ticket.id);
    if (!claimed) return { ok: true, already: true };
    const body = sarhanHandoff(ticket.ticketNumber);
    await this.repo.createMessage({
      ticket: { connect: { id: ticket.id } },
      authorKind: 'SARHAN',
      isStaffReply: true,
      body,
    });
    await this.repo.updateTicket(ticket.id, {
      metadata: withHandoffAt(asMeta(ticket.metadata)) as Prisma.InputJsonValue,
    });
    await this.alertHandoff(ticket, reason);
    this.emitTicket(ticket.id, 'support:message', {
      ticketId: ticket.id,
      authorKind: 'SARHAN',
      body,
    });
    return { ok: true, already: false };
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
      this.scheduleSarhan(ticketId);
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
    // Cross-process ping (ticket id only). The app refetches the thread.
    if (event === 'support:message') this.supportBridge?.notify(ticketId);
  }

  /** Model work must not hold the HTTP request. The socket ping delivers the reply. */
  private scheduleSarhan(ticketId: string) {
    setImmediate(() => {
      void this.runSarhanIfActive(ticketId).catch((err) => {
        this.logger.warn(
          {
            event: 'AI_TURN_FAILED',
            errorName: err instanceof Error ? err.name : undefined,
          },
          'Support assistant turn failed',
        );
      });
    });
  }

  /** Fire the one-time handoff alert; never throws (ticket flow must not fail). */
  private async alertHandoff(
    ticket: { id: string; ticketNumber: string; priority?: string | null },
    reason: SupportEscalationReason,
  ) {
    try {
      await this.notifications.notifyEscalatedToHuman({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        priority: ticket.priority ?? 'NORMAL',
        reason,
      });
    } catch {
      this.logger.warn(
        {
          event: 'SUPPORT_HANDOFF_ALERT_FAILED',
          ticketNumber: ticket.ticketNumber,
        },
        'Support handoff alert failed',
      );
    }
  }

  /**
   * Refunds, fraud, payment disputes, human requests and instruction-injection
   * stay on the current assistant. The agent is only an extra read-only path.
   */
  private mustKeepCurrentAssistant(text: string): boolean {
    return (
      REFUND_RE.test(text) ||
      FRAUD_RE.test(text) ||
      PAYMENT_DISPUTE_RE.test(text) ||
      HUMAN_REQUEST_RE.test(text) ||
      JAILBREAK_RE.test(text)
    );
  }

  private async csTurn(
    reporterId: string | null | undefined,
    text: string,
    ticketId: string,
  ): Promise<SarhanTurnResult | null> {
    if (!isCsAgentEnabled() || !this.csAgent || !reporterId) return null;
    if (this.mustKeepCurrentAssistant(text)) return null;
    try {
      const reply = await this.csAgent.reply({
        userId: reporterId,
        text,
        ticketId,
      });
      if (!reply.accepted) return null;
      return {
        replyAr: reply.replyAr,
        escalate: false,
        metadata: {},
        missingInformation: [],
      };
    } catch (err) {
      this.logger.warn(
        {
          event: 'CS_AGENT_FAILED',
          errorName: err instanceof Error ? err.name : undefined,
        },
        'Customer-service agent failed — using the FAQ assistant',
      );
      return null;
    }
  }

  private async runSarhanIfActive(ticketId: string) {
    await this.runtimeFlags?.refresh();
    const ticket = await this.repo.findTicketById(ticketId);
    if (!ticket || ticket.handlerMode !== 'AI_ACTIVE') return;
    if (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED') return;

    // SARH_AI_ENABLED / SARH_ASSISTANT_ENABLED off → no assistant turn and no
    // model call; hand the ticket to the human team instead.
    if (!isAssistantEnabled()) {
      const claimed = await this.repo.claimHumanHandoff(ticket.id);
      if (!claimed) return;
      const body = sarhanHandoff(ticket.ticketNumber);
      await this.repo.createMessage({
        ticket: { connect: { id: ticket.id } },
        authorKind: 'SARHAN',
        isStaffReply: true,
        body,
      });
      this.logger.info(
        {
          event: 'AI_ASSISTANT_DISABLED_HANDOFF',
          ticketNumber: ticket.ticketNumber,
        },
        'Support assistant disabled — ticket handed to staff',
      );
      await this.repo.updateTicket(ticket.id, {
        metadata: withHandoffAt(
          asMeta(ticket.metadata),
        ) as Prisma.InputJsonValue,
      });
      await this.alertHandoff(ticket, 'assistant_disabled');
      this.emitTicket(ticket.id, 'support:message', {
        ticketId: ticket.id,
        authorKind: 'SARHAN',
        body,
      });
      return;
    }

    const context = await this.aiContext.build(ticket);
    const existingMeta = asMeta(ticket.metadata);
    const customerText = lastCustomerBody(ticket);
    const agentTurn = await this.csTurn(
      ticket.reporterId,
      customerText,
      ticket.id,
    );
    const turn = agentTurn ?? (await this.sarhan.nextTurn(context, existingMeta));

    await this.repo.createMessage({
      ticket: { connect: { id: ticket.id } },
      authorKind: 'SARHAN',
      isStaffReply: true,
      body: turn.replyAr,
    });

    // The handoff is claimed atomically (AI_ACTIVE → HUMAN_ACTIVE) so a
    // concurrent turn or a retried request cannot alert twice.
    const handedOff = turn.escalate
      ? await this.repo.claimHumanHandoff(ticket.id)
      : false;

    // Status and handlerMode for a handoff are written only inside
    // claimHumanHandoff (conditional AI_ACTIVE → HUMAN_ACTIVE). A later
    // update here would clobber a staff reply that landed in between
    // (IN_PROGRESS) back to WAITING_FOR_SUPPORT.
    const previous = asMeta(ticket.metadata);
    const metadata: Record<string, unknown> = {
      ...previous,
      ...(turn.metadata ?? {}),
    };
    delete metadata.handoffAt;
    if (handedOff) metadata.handoffAt = new Date().toISOString();
    else if (typeof previous.handoffAt === 'string') {
      metadata.handoffAt = previous.handoffAt;
    }
    await this.repo.updateTicket(ticket.id, {
      metadata: metadata as Prisma.InputJsonValue,
      ...(turn.escalate
        ? {}
        : {
            status: 'WAITING_FOR_CUSTOMER' as const,
          }),
    });

    if (turn.escalate) {
      this.logger.info(
        { event: 'AI_ESCALATED', ticketNumber: ticket.ticketNumber },
        'Support assistant escalated ticket',
      );
      if (handedOff) {
        await this.alertHandoff(
          ticket,
          turn.escalationReason ?? 'assistant_decision',
        );
      }
    }

    this.emitTicket(ticket.id, 'support:message', {
      ticketId: ticket.id,
      authorKind: 'SARHAN',
      body: turn.replyAr,
    });
  }
}
