import { Injectable } from '@nestjs/common';
import { Prisma, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_TICKET_STATUS_GROUPS } from '../constants/support.constants';

const notDeleted = { deletedAt: null };

/** Open human tickets with no staff message. Clock is metadata.handoffAt. */
export const AWAITING_STAFF_HANDOFF_WHERE: Prisma.SupportTicketWhereInput = {
  deletedAt: null,
  handlerMode: 'HUMAN_ACTIVE',
  status: { notIn: ['CLOSED', 'RESOLVED'] },
  messages: { none: { authorKind: 'STAFF' } },
};

function paginate<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
) {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

const AUTHOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  role: true,
} as const;

const TICKET_INCLUDE = {
  reporter: { select: AUTHOR_SELECT },
  assignedTo: { select: AUTHOR_SELECT },
  attachments: true,
  messages: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      author: { select: AUTHOR_SELECT },
      attachments: true,
    },
  },
} satisfies Prisma.SupportTicketInclude;

@Injectable()
export class SupportRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllStaffUserIds() {
    return this.prisma.user.findMany({
      take: 200,
      where: {
        role: { in: ['ADMIN', 'MODERATOR'] },
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
  }

  async listUserTickets(
    userId: string,
    page: number,
    pageSize: number,
    status?: string,
  ) {
    const where: Prisma.SupportTicketWhereInput = {
      ...notDeleted,
      type: 'SUPPORT',
      reporterId: userId,
      ...(status ? { status: status as TicketStatus } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          ticketNumber: true,
          category: true,
          status: true,
          handlerMode: true,
          subject: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  /**
   * «بلاغاتي» — the requester's own reports: content reports (type REPORT)
   * plus fraud tickets (category FRAUD). Always scoped by reporterId.
   */
  async listUserReportTickets(
    userId: string,
    page: number,
    pageSize: number,
    status?: TicketStatus[],
  ) {
    const where: Prisma.SupportTicketWhereInput = {
      ...notDeleted,
      reporterId: userId,
      OR: [{ type: 'REPORT' }, { category: 'FRAUD' }],
      ...(status?.length ? { status: { in: status } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          ticketNumber: true,
          type: true,
          category: true,
          status: true,
          subject: true,
          description: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  async listAdminTickets(query: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
    statusGroup?: string;
    category?: string;
    type?: 'SUPPORT' | 'REPORT';
  }) {
    const { page, pageSize, search, status, statusGroup, category, type } =
      query;
    const groupStatuses =
      statusGroup && statusGroup !== 'all'
        ? ADMIN_TICKET_STATUS_GROUPS[
            statusGroup as keyof typeof ADMIN_TICKET_STATUS_GROUPS
          ]
        : undefined;
    const where: Prisma.SupportTicketWhereInput = {
      ...notDeleted,
      ...(type ? { type } : { type: 'SUPPORT' }),
      ...(status ? { status: status as TicketStatus } : {}),
      ...(groupStatuses
        ? { status: { in: [...groupStatuses] as TicketStatus[] } }
        : {}),
      ...(category ? { category } : {}),
      ...(search?.trim()
        ? {
            OR: [
              { subject: { contains: search.trim(), mode: 'insensitive' } },
              {
                ticketNumber: { contains: search.trim(), mode: 'insensitive' },
              },
              { description: { contains: search.trim(), mode: 'insensitive' } },
              {
                reporter: {
                  OR: [
                    {
                      arabicName: {
                        contains: search.trim(),
                        mode: 'insensitive',
                      },
                    },
                    {
                      displayName: {
                        contains: search.trim(),
                        mode: 'insensitive',
                      },
                    },
                    {
                      username: {
                        contains: search.trim(),
                        mode: 'insensitive',
                      },
                    },
                  ],
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          reporter: { select: AUTHOR_SELECT },
          assignedTo: { select: AUTHOR_SELECT },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  findTicketById(id: string) {
    return this.prisma.supportTicket.findFirst({
      where: { id, ...notDeleted },
      include: TICKET_INCLUDE,
    });
  }

  findUserTicket(id: string, userId: string) {
    return this.prisma.supportTicket.findFirst({
      // Own report tickets («بلاغاتي») open in the same thread view.
      where: {
        id,
        reporterId: userId,
        type: { in: ['SUPPORT', 'REPORT'] },
        ...notDeleted,
      },
      include: TICKET_INCLUDE,
    });
  }

  createTicket(data: Prisma.SupportTicketCreateInput) {
    return this.prisma.supportTicket.create({
      data,
      include: TICKET_INCLUDE,
    });
  }

  /**
   * Handed to a human, still open, and no staff message yet.
   * The two-hour clock is `metadata.handoffAt`, applied by the caller.
   * `updatedAt` is absent: customer replies and metadata writes move it.
   */
  listAwaitingStaffHandoffs(take = 100) {
    return this.prisma.supportTicket.findMany({
      where: AWAITING_STAFF_HANDOFF_WHERE,
      select: {
        id: true,
        ticketNumber: true,
        priority: true,
        metadata: true,
      },
      orderBy: { createdAt: 'asc' },
      take,
    });
  }

  /**
   * Atomic AI → human handoff. Only the first caller while the ticket is still
   * AI_ACTIVE gets `true` (concurrent turns / retries get `false`), so the
   * handoff alert fires once per real transition.
   */
  findRecentOpenByCategory(userId: string, category: string, since: Date) {
    return this.prisma.supportTicket.findFirst({
      where: {
        reporterId: userId,
        category,
        deletedAt: null,
        createdAt: { gte: since },
        status: { notIn: ['CLOSED', 'RESOLVED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, ticketNumber: true },
    });
  }

  findOwnedByNumber(userId: string, ticketNumber: string) {
    return this.prisma.supportTicket.findFirst({
      where: { reporterId: userId, ticketNumber, deletedAt: null },
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        priority: true,
        metadata: true,
        handlerMode: true,
        subject: true,
      },
    });
  }

  async claimHumanHandoff(id: string): Promise<boolean> {
    const res = await this.prisma.supportTicket.updateMany({
      where: { id, handlerMode: 'AI_ACTIVE' },
      data: { handlerMode: 'HUMAN_ACTIVE', status: 'WAITING_FOR_SUPPORT' },
    });
    return res.count === 1;
  }

  updateTicket(id: string, data: Prisma.SupportTicketUpdateInput) {
    return this.prisma.supportTicket.update({
      where: { id },
      data,
      include: TICKET_INCLUDE,
    });
  }

  createMessage(data: Prisma.SupportTicketMessageCreateInput) {
    return this.prisma.supportTicketMessage.create({
      data,
      include: {
        author: { select: AUTHOR_SELECT },
        attachments: true,
      },
    });
  }

  findUserNames(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { arabicName: true, displayName: true },
    });
  }

  findLatestSrhTicketNumber(year: number) {
    const prefix = `SRH-${year}-`;
    return this.prisma.supportTicket.findFirst({
      where: { ticketNumber: { startsWith: prefix } },
      orderBy: { ticketNumber: 'desc' },
      select: { ticketNumber: true },
    });
  }

  isUniqueConstraint(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'P2002'
    );
  }

  getVerificationByUserId(userId: string) {
    return this.prisma.accountVerificationRequest.findUnique({
      where: { userId },
      include: {
        documents: true,
        timeline: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  getVerificationById(id: string) {
    return this.prisma.accountVerificationRequest.findUnique({
      where: { id },
      include: {
        user: { select: AUTHOR_SELECT },
        documents: true,
        timeline: { orderBy: { createdAt: 'desc' } },
        reviewedBy: { select: AUTHOR_SELECT },
      },
    });
  }

  async listVerificationRequests(query: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
  }) {
    const { page, pageSize, search, status } = query;
    const where: Prisma.AccountVerificationRequestWhereInput = {
      ...(status ? { status: status as never } : {}),
      ...(search?.trim()
        ? {
            OR: [
              { fullName: { contains: search.trim(), mode: 'insensitive' } },
              { nationalId: { contains: search.trim(), mode: 'insensitive' } },
              {
                businessName: { contains: search.trim(), mode: 'insensitive' },
              },
              {
                user: {
                  username: { contains: search.trim(), mode: 'insensitive' },
                },
              },
              {
                user: {
                  arabicName: { contains: search.trim(), mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.accountVerificationRequest.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: AUTHOR_SELECT },
        },
      }),
      this.prisma.accountVerificationRequest.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  upsertVerification(
    userId: string,
    data: {
      fullName?: string | null;
      nationalId?: string | null;
      businessName?: string | null;
      businessType?: string | null;
      additionalInfo?: string | null;
      requestedTier?: string | null;
      approvedTier?: string | null;
      status?:
        'DRAFT' | 'UNDER_REVIEW' | 'NEEDS_AMENDMENTS' | 'VERIFIED' | 'REJECTED';
    },
  ) {
    return this.prisma.accountVerificationRequest.upsert({
      where: { userId },
      create: {
        userId,
        ...data,
      },
      update: data,
      include: {
        documents: true,
        timeline: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  updateVerification(
    id: string,
    data: Prisma.AccountVerificationRequestUpdateInput,
  ) {
    return this.prisma.accountVerificationRequest.update({
      where: { id },
      data,
      include: {
        user: { select: AUTHOR_SELECT },
        documents: true,
        timeline: { orderBy: { createdAt: 'desc' } },
        reviewedBy: { select: AUTHOR_SELECT },
      },
    });
  }

  addVerificationDocument(data: Prisma.AccountVerificationDocumentCreateInput) {
    return this.prisma.accountVerificationDocument.create({ data });
  }

  deleteVerificationDocument(id: string, requestId: string) {
    return this.prisma.accountVerificationDocument.deleteMany({
      where: { id, requestId },
    });
  }

  addVerificationTimeline(
    data: Prisma.AccountVerificationTimelineEventCreateInput,
  ) {
    return this.prisma.accountVerificationTimelineEvent.create({ data });
  }

  async listFaqs(query: {
    search?: string;
    category?: string;
    activeOnly?: boolean;
  }) {
    const { search, category, activeOnly = true } = query;
    const where: Prisma.FaqWhereInput = {
      ...notDeleted,
      ...(activeOnly ? { isActive: true } : {}),
      ...(category ? { category: category as never } : {}),
      ...(search?.trim()
        ? {
            OR: [
              { questionAr: { contains: search.trim(), mode: 'insensitive' } },
              { answerAr: { contains: search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.prisma.faq.findMany({
      take: 200,
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async listAdminFaqs(query: { search?: string; category?: string }) {
    const { search, category } = query;
    const where: Prisma.FaqWhereInput = {
      ...notDeleted,
      ...(category ? { category: category as never } : {}),
      ...(search?.trim()
        ? {
            OR: [
              { questionAr: { contains: search.trim(), mode: 'insensitive' } },
              { answerAr: { contains: search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.prisma.faq.findMany({
      take: 200,
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  createFaq(data: Prisma.FaqCreateInput) {
    return this.prisma.faq.create({ data });
  }

  updateFaq(id: string, data: Prisma.FaqUpdateInput) {
    return this.prisma.faq.update({ where: { id }, data });
  }

  softDeleteFaq(id: string) {
    return this.prisma.faq.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  reorderFaqs(items: { id: string; sortOrder: number }[]) {
    return this.prisma.$transaction(
      items.map((item) =>
        this.prisma.faq.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
  }

  countFaqs() {
    return this.prisma.faq.count({ where: { ...notDeleted, isActive: true } });
  }

  /** Every active FAQ (knowledge base is ~120 rows) for in-memory retrieval. */
  listActiveFaqsForRetrieval() {
    return this.prisma.faq.findMany({
      take: 1000,
      where: { ...notDeleted, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Seed upsert by stable key. Existing rows keep their admin isActive/sortOrder. */
  upsertFaqByKey(entry: {
    key: string;
    questionAr: string;
    answerAr: string;
    category: Prisma.FaqCreateInput['category'];
    keywords: string[];
    actionRoute?: string | null;
    actionLabel?: string | null;
    sortOrder: number;
  }) {
    const content = {
      questionAr: entry.questionAr,
      answerAr: entry.answerAr,
      category: entry.category,
      keywords: entry.keywords,
      actionRoute: entry.actionRoute ?? null,
      actionLabel: entry.actionLabel ?? null,
    };
    return this.prisma.faq.upsert({
      where: { key: entry.key },
      create: {
        key: entry.key,
        ...content,
        sortOrder: entry.sortOrder,
        isActive: true,
      },
      update: content,
    });
  }

  /** Legacy rows (no key) that are still active — candidates for deactivation. */
  listActiveUnkeyedFaqs() {
    return this.prisma.faq.findMany({
      take: 500,
      where: { ...notDeleted, isActive: true, key: null },
      select: { id: true, questionAr: true, answerAr: true },
    });
  }

  /** Soft-retire FAQs (isActive=false). Never deletes rows. */
  deactivateFaqs(ids: string[]) {
    if (!ids.length) return Promise.resolve({ count: 0 });
    return this.prisma.faq.updateMany({
      where: { id: { in: ids } },
      data: { isActive: false },
    });
  }

  getAppSetting(key: string) {
    return this.prisma.appSetting.findUnique({
      where: { key },
      select: { value: true, updatedAt: true },
    });
  }

  upsertAppSetting(
    key: string,
    value: Prisma.InputJsonValue,
    labelAr: string,
    category = 'support',
  ) {
    return this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value, labelAr, category },
      update: { value },
      select: { value: true, updatedAt: true },
    });
  }

  findReporterTier(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { verifiedTier: true },
    });
  }
}
