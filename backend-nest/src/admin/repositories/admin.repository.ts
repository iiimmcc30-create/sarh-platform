import { Injectable } from '@nestjs/common';
import { Prisma, Role, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LISTING_COMMISSION_PERCENT } from '../../listings/listing-fee';
import {
  notDeleted,
  retentionCutoff,
  softDeleteFields,
} from '../../common/utils/soft-delete.util';
import type { PaginationQueryDto } from '../dto/admin.dto';
import { ADMIN_MEMBERSHIP_SELECT } from '../../subscriptions/verification/admin-membership';

const USER_SELECT = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  role: true,
  verified: true,
  verifiedTier: true,
  isActive: true,
  country: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const AUTHOR_SELECT = {
  id: true,
  username: true,
  arabicName: true,
  displayName: true,
  avatar: true,
} satisfies Prisma.UserSelect;

const OWNER_USER_SELECT = {
  ...USER_SELECT,
  phone: true,
  emailVerified: true,
  bio: true,
  lastSeenAt: true,
  _count: {
    select: {
      posts: true,
      listings: true,
      followers: true,
      following: true,
      liveStreams: true,
    },
  },
} satisfies Prisma.UserSelect;

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

function searchOr(
  fields: string[],
  search?: string,
): Prisma.UserWhereInput | undefined {
  if (!search?.trim()) return undefined;
  const q = search.trim();
  return {
    OR: fields.map((f) => ({
      [f]: { contains: q, mode: 'insensitive' as const },
    })),
  };
}

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  runCleanup(now: Date) {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const archivedBefore = retentionCutoff();

    return Promise.all([
      this.prisma.userSession.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      this.prisma.notification.deleteMany({
        where: { isRead: true, createdAt: { lt: ninetyDaysAgo } },
      }),
      this.prisma.story.deleteMany({
        where: { expiresAt: { lt: thirtyDaysAgo }, deletedAt: null },
      }),
      // Hard purge soft-deleted content after retention window
      this.prisma.post.deleteMany({
        where: { deletedAt: { lt: archivedBefore } },
      }),
      this.prisma.listing.deleteMany({
        where: { deletedAt: { lt: archivedBefore } },
      }),
      this.prisma.liveStream.deleteMany({
        where: { deletedAt: { lt: archivedBefore } },
      }),
      this.prisma.supportTicket.deleteMany({
        where: { deletedAt: { lt: archivedBefore } },
      }),
      this.prisma.contentSection.deleteMany({
        where: { deletedAt: { lt: archivedBefore } },
      }),
      this.prisma.story.deleteMany({
        where: { deletedAt: { lt: archivedBefore } },
      }),
    ]);
  }

  findAdminUserForLogin(login: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [{ email: login }, { username: login }, { phone: login }],
        role: { in: [Role.ADMIN, Role.MODERATOR] },
        isActive: true,
        deletedAt: null,
      },
    });
  }

  findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
  }

  /** Admin user detail: profile + subscription + verification summary. */
  findUserDetailById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { ...OWNER_USER_SELECT, ...ADMIN_MEMBERSHIP_SELECT },
    });
  }

  /** Last paid subscription payment per user (current period start). */
  async findLastPaidSubscriptionPayments(userIds: string[]) {
    if (!userIds.length) return [];
    return this.prisma.payment.findMany({
      where: {
        userId: { in: userIds },
        referenceType: 'subscription',
        status: 'paid',
      },
      orderBy: [{ userId: 'asc' }, { createdAt: 'desc' }],
      distinct: ['userId'],
      select: { userId: true, paidAt: true, createdAt: true, metadata: true },
    });
  }

  async listUsers(query: PaginationQueryDto) {
    const { page, pageSize, search } = query;
    const where: Prisma.UserWhereInput = {
      ...notDeleted,
      ...searchOr(['username', 'email', 'arabicName', 'displayName'], search),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: { ...USER_SELECT, ...ADMIN_MEMBERSHIP_SELECT },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  updateUser(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
  }

  purgeUser(id: string) {
    const ts = Date.now();
    return this.prisma.$transaction([
      this.prisma.userSession.deleteMany({ where: { userId: id } }),
      this.prisma.user.update({
        where: { id },
        data: {
          isActive: false,
          ...softDeleteFields(),
          username: `deleted_${id.slice(0, 8)}_${ts}`,
          email: `deleted_${ts}@safat.deleted`,
          phone: null,
          googleId: null,
          fcmToken: null,
          displayName: 'Deleted User',
          arabicName: 'مستخدم محذوف',
          bio: null,
          avatar: null,
          coverImage: null,
        },
      }),
    ]);
  }

  async listPosts(query: PaginationQueryDto) {
    const { page, pageSize, search, hidden } = query;
    const where: Prisma.PostWhereInput = {
      ...notDeleted,
      ...(hidden === 'true'
        ? { isHidden: true }
        : hidden === 'false'
          ? { isHidden: false }
          : {}),
      ...(search?.trim()
        ? {
            OR: [
              { content: { contains: search.trim(), mode: 'insensitive' } },
              {
                arabicContent: { contains: search.trim(), mode: 'insensitive' },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: { author: { select: AUTHOR_SELECT } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.post.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  updatePost(id: string, data: Prisma.PostUpdateInput) {
    return this.prisma.post.update({
      where: { id },
      data,
      include: { author: { select: AUTHOR_SELECT } },
    });
  }

  softDeletePost(id: string) {
    return this.prisma.post.update({
      where: { id },
      data: { ...softDeleteFields(), isHidden: true },
    });
  }

  async listListings(query: PaginationQueryDto) {
    const { page, pageSize, search, status } = query;
    const where: Prisma.ListingWhereInput = {
      ...notDeleted,
      ...(status
        ? { status: status as Prisma.EnumListingStatusFilter['equals'] }
        : {}),
      ...(search?.trim()
        ? {
            OR: [
              { title: { contains: search.trim(), mode: 'insensitive' } },
              { arabicTitle: { contains: search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        include: { seller: { select: AUTHOR_SELECT } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.listing.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  updateListing(id: string, data: Prisma.ListingUpdateInput) {
    return this.prisma.listing.update({
      where: { id },
      data,
      include: { seller: { select: AUTHOR_SELECT } },
    });
  }

  findListingOrigin(id: string) {
    return this.prisma.listing.findFirst({
      where: { id, ...notDeleted },
      select: {
        id: true,
        origin: true,
        sellerId: true,
        displayUsername: true,
        displaySellerName: true,
        displayPhone: true,
        displayRegion: true,
        title: true,
        arabicTitle: true,
        description: true,
        arabicDescription: true,
        price: true,
        category: true,
        images: true,
        videoUrl: true,
        thumbnailUrl: true,
        contactPhone: true,
        location: true,
        arabicLocation: true,
      },
    });
  }

  countUsers() {
    return this.prisma.user.count();
  }

  createManagedListing(
    data: Prisma.ListingUncheckedCreateInput,
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.listing.create({
        data,
        include: { seller: { select: AUTHOR_SELECT } },
      });
      await tx.activity.create({
        data: {
          actorId,
          type: 'ADMIN_MANAGED_LISTING_CREATED',
          entityId: listing.id,
          entityType: 'listing',
        },
      });
      return listing;
    });
  }

  updateManagedListing(
    id: string,
    data: Prisma.ListingUncheckedUpdateInput,
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.listing.update({
        where: { id },
        data,
        include: { seller: { select: AUTHOR_SELECT } },
      });
      await tx.activity.create({
        data: {
          actorId,
          type: 'ADMIN_MANAGED_LISTING_UPDATED',
          entityId: listing.id,
          entityType: 'listing',
        },
      });
      return listing;
    });
  }

  async softDeleteListingRecorded(
    id: string,
    actorId: string,
    managed: boolean,
  ) {
    const listing = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.listing.update({
        where: { id },
        data: { ...softDeleteFields(), status: 'suspended' },
      });
      if (managed) {
        await tx.activity.create({
          data: {
            actorId,
            type: 'ADMIN_MANAGED_LISTING_DELETED',
            entityId: id,
            entityType: 'listing',
          },
        });
      }
      return updated;
    });
    return listing;
  }

  softDeleteListing(id: string) {
    return this.prisma.listing.update({
      where: { id },
      data: { ...softDeleteFields(), status: 'suspended' },
    });
  }

  async listTickets(query: PaginationQueryDto) {
    const { page, pageSize, search, status, category } = query;
    const where: Prisma.SupportTicketWhereInput = {
      ...notDeleted,
      type: 'REPORT',
      ...(status ? { status: status as TicketStatus } : {}),
      ...(category ? { category } : {}),
      ...(search?.trim()
        ? {
            OR: [
              { subject: { contains: search.trim(), mode: 'insensitive' } },
              {
                ticketNumber: { contains: search.trim(), mode: 'insensitive' },
              },
              { description: { contains: search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  findTicket(id: string) {
    return this.prisma.supportTicket.findUnique({ where: { id } });
  }

  updateTicket(id: string, data: Prisma.SupportTicketUpdateInput) {
    return this.prisma.supportTicket.update({ where: { id }, data });
  }

  softDeleteTicket(id: string) {
    return this.prisma.supportTicket.update({
      where: { id },
      data: { ...softDeleteFields(), status: 'CLOSED' },
    });
  }

  async listLiveStreams(query: PaginationQueryDto) {
    const { page, pageSize, search, live } = query;
    const where: Prisma.LiveStreamWhereInput = {
      ...notDeleted,
      ...(live === 'true'
        ? { isLive: true }
        : live === 'false'
          ? { isLive: false }
          : {}),
      ...(search?.trim()
        ? {
            OR: [
              { title: { contains: search.trim(), mode: 'insensitive' } },
              { arabicTitle: { contains: search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.liveStream.findMany({
        where,
        include: { host: { select: AUTHOR_SELECT } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.liveStream.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  stopLiveStream(id: string) {
    return this.prisma.liveStream.update({
      where: { id },
      data: { isLive: false, endedAt: new Date(), viewers: 0 },
      include: { host: { select: AUTHOR_SELECT } },
    });
  }

  softDeleteLiveStream(id: string) {
    return this.prisma.liveStream.update({
      where: { id },
      data: {
        ...softDeleteFields(),
        isLive: false,
        endedAt: new Date(),
        viewers: 0,
      },
    });
  }

  listSettings() {
    return this.prisma.appSetting.findMany({
      take: 200,
      orderBy: { key: 'asc' },
    });
  }

  upsertSetting(
    key: string,
    value: unknown,
    labelAr?: string,
    category?: string,
  ) {
    return this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, labelAr, category },
      update: {
        value: value as Prisma.InputJsonValue,
        ...(labelAr !== undefined ? { labelAr } : {}),
        ...(category !== undefined ? { category } : {}),
      },
    });
  }

  listSections() {
    return this.prisma.contentSection.findMany({
      where: notDeleted,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 20,
          select: {
            id: true,
            version: true,
            isPublished: true,
            createdByName: true,
            createdAt: true,
            titleAr: true,
          },
        },
      },
    });
  }

  getSection(id: string) {
    return this.prisma.contentSection.findFirst({
      where: { id, ...notDeleted },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 50 },
      },
    });
  }

  createSection(data: Prisma.ContentSectionCreateInput) {
    return this.prisma.contentSection.create({ data });
  }

  updateSection(id: string, data: Prisma.ContentSectionUpdateInput) {
    return this.prisma.contentSection.update({ where: { id }, data });
  }

  softDeleteSection(id: string) {
    return this.prisma.contentSection.update({
      where: { id },
      data: { ...softDeleteFields(), isActive: false },
    });
  }

  async nextSectionVersion(sectionId: string) {
    const last = await this.prisma.contentSectionVersion.findFirst({
      where: { sectionId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return (last?.version ?? 0) + 1;
  }

  createSectionVersion(data: Prisma.ContentSectionVersionCreateInput) {
    return this.prisma.contentSectionVersion.create({ data });
  }

  getSectionVersion(id: string) {
    return this.prisma.contentSectionVersion.findUnique({ where: { id } });
  }

  listSectionVersions(sectionId: string) {
    return this.prisma.contentSectionVersion.findMany({
      take: 200,
      where: { sectionId },
      orderBy: { version: 'desc' },
    });
  }

  async getDashboardStats() {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(
      todayStart.getTime() - 6 * 24 * 60 * 60 * 1000,
    );
    const thirtyDaysAgo = new Date(
      todayStart.getTime() - 29 * 24 * 60 * 60 * 1000,
    );

    const [
      totalUsers,
      activeUsers,
      bannedUsers,
      newToday,
      newYesterday,
      newUsers7d,
      totalPosts,
      hiddenPosts,
      totalListings,
      activeListings,
      suspendedListings,
      listingsToday,
      listingsYesterday,
      listings7d,
      totalStreams,
      liveNow,
      openTickets,
      urgentTickets,
      totalTickets,
      reportsToday,
      reportsYesterday,
      paymentsPaid,
      paymentsFailed,
      paymentsPending,
      paymentsRefunded,
      listingFeesPaidAgg,
      listingFeesPendingAgg,
      usersRaw,
      paymentsByDayRaw,
      reportsRaw,
      ticketsByCategory,
      recentPayments,
      recentReports,
    ] = await Promise.all([
      this.prisma.user.count({ where: notDeleted }),
      this.prisma.user.count({ where: { ...notDeleted, isActive: true } }),
      this.prisma.user.count({ where: { ...notDeleted, isActive: false } }),
      this.prisma.user.count({
        where: { ...notDeleted, createdAt: { gte: todayStart } },
      }),
      this.prisma.user.count({
        where: {
          ...notDeleted,
          createdAt: { gte: yesterdayStart, lt: todayStart },
        },
      }),
      this.prisma.user.count({
        where: { ...notDeleted, createdAt: { gte: sevenDaysAgo } },
      }),
      this.prisma.post.count({ where: notDeleted }),
      this.prisma.post.count({ where: { ...notDeleted, isHidden: true } }),
      this.prisma.listing.count({ where: notDeleted }),
      this.prisma.listing.count({ where: { ...notDeleted, status: 'active' } }),
      this.prisma.listing.count({
        where: { ...notDeleted, status: 'suspended' },
      }),
      this.prisma.listing.count({
        where: { ...notDeleted, createdAt: { gte: todayStart } },
      }),
      this.prisma.listing.count({
        where: {
          ...notDeleted,
          createdAt: { gte: yesterdayStart, lt: todayStart },
        },
      }),
      this.prisma.listing.count({
        where: { ...notDeleted, createdAt: { gte: sevenDaysAgo } },
      }),
      this.prisma.liveStream.count({ where: notDeleted }),
      this.prisma.liveStream.count({ where: { ...notDeleted, isLive: true } }),
      this.prisma.supportTicket.count({
        where: {
          ...notDeleted,
          type: 'REPORT',
          status: { in: ['OPEN', 'IN_REVIEW', 'IN_PROGRESS'] },
        },
      }),
      this.prisma.supportTicket.count({
        where: {
          ...notDeleted,
          type: 'REPORT',
          priority: 'URGENT',
          status: { not: 'CLOSED' },
        },
      }),
      this.prisma.supportTicket.count({
        where: { ...notDeleted, type: 'REPORT' },
      }),
      this.prisma.supportTicket.count({
        where: {
          ...notDeleted,
          type: 'REPORT',
          createdAt: { gte: todayStart },
        },
      }),
      this.prisma.supportTicket.count({
        where: {
          ...notDeleted,
          type: 'REPORT',
          createdAt: { gte: yesterdayStart, lt: todayStart },
        },
      }),
      this.prisma.payment.count({
        where: {
          status: 'paid',
          OR: [
            { referenceType: null },
            { referenceType: { not: 'commission' } },
          ],
        },
      }),
      this.prisma.payment.count({
        where: {
          status: 'failed',
          OR: [
            { referenceType: null },
            { referenceType: { not: 'commission' } },
          ],
        },
      }),
      this.prisma.payment.count({
        where: {
          status: 'pending',
          OR: [
            { referenceType: null },
            { referenceType: { not: 'commission' } },
          ],
        },
      }),
      this.prisma.payment.count({
        where: {
          status: 'refunded',
          OR: [
            { referenceType: null },
            { referenceType: { not: 'commission' } },
          ],
        },
      }),
      this.prisma.listingFee.aggregate({
        where: { status: 'paid' },
        _sum: { commission: true },
        _count: { _all: true },
      }),
      this.prisma.listingFee.aggregate({
        where: { status: { in: ['pending', 'overdue'] } },
        _sum: { commission: true },
        _count: { _all: true },
      }),
      this.prisma.user.findMany({
        take: 5000,
        where: { ...notDeleted, createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
      }),
      this.prisma.payment.findMany({
        take: 5000,
        where: {
          createdAt: { gte: thirtyDaysAgo },
          OR: [
            { referenceType: null },
            { referenceType: { not: 'commission' } },
          ],
        },
        select: { createdAt: true, status: true },
      }),
      this.prisma.supportTicket.findMany({
        take: 5000,
        where: {
          ...notDeleted,
          type: 'REPORT',
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { createdAt: true },
      }),
      this.prisma.supportTicket.groupBy({
        by: ['category'],
        where: { ...notDeleted, type: 'REPORT' },
        _count: { category: true },
      }),
      this.prisma.payment.findMany({
        where: {
          OR: [
            { referenceType: null },
            { referenceType: { not: 'commission' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          orderId: true,
          amount: true,
          currency: true,
          status: true,
          referenceType: true,
          transactionId: true,
          createdAt: true,
          user: {
            select: { id: true, arabicName: true, displayName: true },
          },
          integrationOrder: {
            select: {
              provider: true,
              merchantOrderReference: true,
              externalOrderId: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.supportTicket.findMany({
        where: { ...notDeleted, type: 'REPORT' },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          subject: true,
          status: true,
          category: true,
          createdAt: true,
          reporter: {
            select: { id: true, arabicName: true, displayName: true },
          },
        },
      }),
    ]);

    const fillDays = (from: Date, days: number) => {
      const map = new Map<string, number>();
      for (let i = 0; i < days; i++) {
        const d = new Date(from.getTime() + i * 24 * 60 * 60 * 1000);
        map.set(d.toISOString().slice(0, 10), 0);
      }
      return map;
    };

    const users7 = fillDays(sevenDaysAgo, 7);
    const users30 = fillDays(thirtyDaysAgo, 30);
    for (const u of usersRaw) {
      const key = u.createdAt.toISOString().slice(0, 10);
      if (users7.has(key)) users7.set(key, (users7.get(key) ?? 0) + 1);
      if (users30.has(key)) users30.set(key, (users30.get(key) ?? 0) + 1);
    }

    const payments7Paid = fillDays(sevenDaysAgo, 7);
    const payments7Failed = fillDays(sevenDaysAgo, 7);
    for (const p of paymentsByDayRaw) {
      const key = p.createdAt.toISOString().slice(0, 10);
      if (p.status === 'paid' && payments7Paid.has(key)) {
        payments7Paid.set(key, (payments7Paid.get(key) ?? 0) + 1);
      }
      if (p.status === 'failed' && payments7Failed.has(key)) {
        payments7Failed.set(key, (payments7Failed.get(key) ?? 0) + 1);
      }
    }

    const reports7 = fillDays(sevenDaysAgo, 7);
    for (const r of reportsRaw) {
      const key = r.createdAt.toISOString().slice(0, 10);
      if (reports7.has(key)) reports7.set(key, (reports7.get(key) ?? 0) + 1);
    }

    const money = (n: number | null | undefined) =>
      Math.round((n ?? 0) * 100) / 100;

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        banned: bannedUsers,
        newToday,
        newYesterday,
        newLast7Days: newUsers7d,
      },
      posts: { total: totalPosts, hidden: hiddenPosts },
      listings: {
        total: totalListings,
        active: activeListings,
        suspended: suspendedListings,
        newToday: listingsToday,
        newYesterday: listingsYesterday,
        newLast7Days: listings7d,
      },
      liveStreams: { total: totalStreams, liveNow },
      tickets: {
        open: openTickets,
        urgent: urgentTickets,
        total: totalTickets,
        today: reportsToday,
        yesterday: reportsYesterday,
      },
      payments: {
        successful: paymentsPaid,
        failed: paymentsFailed,
        pending: paymentsPending,
        refunded: paymentsRefunded,
      },
      commission: {
        listingCommissionRatePercent: LISTING_COMMISSION_PERCENT,
        listingFeesPaidTotal: money(listingFeesPaidAgg._sum.commission),
        listingFeesPaidCount: listingFeesPaidAgg._count._all,
        listingFeesOutstandingTotal: money(
          listingFeesPendingAgg._sum.commission,
        ),
        listingFeesOutstandingCount: listingFeesPendingAgg._count._all,
        totalCommission: money(listingFeesPaidAgg._sum.commission ?? 0),
      },
      charts: {
        usersByDay: Array.from(users7.entries()).map(([date, count]) => ({
          date,
          count,
        })),
        usersByDay30: Array.from(users30.entries()).map(([date, count]) => ({
          date,
          count,
        })),
        paymentsByDay: Array.from(payments7Paid.entries()).map(
          ([date, paid]) => ({
            date,
            paid,
            failed: payments7Failed.get(date) ?? 0,
          }),
        ),
        reportsByDay: Array.from(reports7.entries()).map(([date, count]) => ({
          date,
          count,
        })),
        ticketsByCategory: ticketsByCategory.map((t) => ({
          category: t.category,
          count: t._count.category,
        })),
      },
      recent: {
        payments: recentPayments,
        reports: recentReports,
      },
    };
  }

  ensureDefaultSettings() {
    const defaults = [
      {
        key: 'maintenanceMode',
        value: false,
        labelAr: 'وضع الصيانة',
        category: 'system',
      },
      {
        key: 'allowRegistration',
        value: true,
        labelAr: 'السماح بالتسجيل',
        category: 'auth',
      },
      {
        key: 'liveStreamsEnabled',
        value: true,
        labelAr: 'تفعيل البث المباشر',
        category: 'features',
      },
      // Paid listing services — show/hide independently in the app
      {
        key: 'features.paidPromotionEnabled',
        value: true,
        labelAr: 'تعزيز الإعلان (الظهور المدفوع)',
        category: 'paid_services',
      },
      {
        key: 'features.paidPinEnabled',
        value: true,
        labelAr: 'تثبيت الإعلان',
        category: 'paid_services',
      },
      {
        key: 'features.paidFeatureEnabled',
        value: true,
        labelAr: 'تمييز الإعلان',
        category: 'paid_services',
      },
      {
        key: 'features.listingFeesEnabled',
        value: true,
        labelAr: 'سداد الرسوم والتعهد وزر ترقية الإعلان',
        category: 'paid_services',
      },
      // Listing paid-services pricing (SAR)
      {
        key: 'pricing.boost.pin.per12h',
        value: 6,
        labelAr: 'تثبيت الإعلان — سعر كل 12 ساعة (ر.س)',
        category: 'pricing',
      },
      {
        key: 'pricing.boost.feature.per12h',
        value: 5,
        labelAr: 'تمييز الإعلان — سعر كل 12 ساعة (ر.س)',
        category: 'pricing',
      },
      {
        key: 'pricing.promotion.per24h',
        value: 10,
        labelAr: 'تعزيز الظهور — الحد الأدنى للميزانية كل 24 ساعة (ر.س)',
        category: 'pricing',
      },
      // Reach estimate factors for visibility promotion
      {
        key: 'pricing.reach.budgetFactorMin',
        value: 9,
        labelAr: 'معامل الوصول الأدنى (الميزانية)',
        category: 'pricing',
      },
      {
        key: 'pricing.reach.budgetFactorMax',
        value: 15,
        labelAr: 'معامل الوصول الأقصى (الميزانية)',
        category: 'pricing',
      },
      {
        key: 'pricing.reach.hourFactorMin',
        value: 3,
        labelAr: 'معامل الوصول الأدنى (الساعات)',
        category: 'pricing',
      },
      {
        key: 'pricing.reach.hourFactorMax',
        value: 5,
        labelAr: 'معامل الوصول الأقصى (الساعات)',
        category: 'pricing',
      },
    ];
    return Promise.all(
      defaults.map((s) =>
        this.prisma.appSetting.upsert({
          where: { key: s.key },
          create: s,
          update: {},
        }),
      ),
    );
  }

  async listListingFeeCompliance() {
    const unpaidOnDeleted = await this.prisma.listingFee.findMany({
      take: 1000,
      where: {
        status: { in: ['pending', 'overdue'] },
        listing: { deletedAt: { not: null } },
      },
      select: {
        id: true,
        commission: true,
        status: true,
        userId: true,
        listingId: true,
        listing: {
          select: {
            id: true,
            arabicTitle: true,
            deletedAt: true,
            sellerDeclaredSold: true,
            deleteReason: true,
          },
        },
        user: {
          select: {
            id: true,
            username: true,
            arabicName: true,
            isActive: true,
          },
        },
      },
    });

    const byUser = new Map<
      string,
      {
        user: {
          id: string;
          username: string;
          arabicName: string;
          isActive: boolean;
        };
        deletedUnpaidCount: number;
        outstandingTotal: number;
        cases: typeof unpaidOnDeleted;
      }
    >();

    for (const row of unpaidOnDeleted) {
      const current = byUser.get(row.userId);
      if (current) {
        current.deletedUnpaidCount += 1;
        current.outstandingTotal += row.commission;
        current.cases.push(row);
      } else {
        byUser.set(row.userId, {
          user: row.user,
          deletedUnpaidCount: 1,
          outstandingTotal: row.commission,
          cases: [row],
        });
      }
    }

    const userIds = [...byUser.keys()];
    const actions = userIds.length
      ? await this.prisma.adminAccountAction.findMany({
          where: { userId: { in: userIds } },
          orderBy: { createdAt: 'desc' },
          take: 200,
          select: {
            id: true,
            userId: true,
            actorId: true,
            action: true,
            reason: true,
            createdAt: true,
          },
        })
      : [];

    const actionsByUser = new Map<string, typeof actions>();
    for (const action of actions) {
      const list = actionsByUser.get(action.userId) ?? [];
      list.push(action);
      actionsByUser.set(action.userId, list);
    }

    return {
      users: [...byUser.values()]
        .sort((a, b) => b.deletedUnpaidCount - a.deletedUnpaidCount)
        .map((row) => ({
          ...row,
          outstandingTotal:
            Math.round((row.outstandingTotal + Number.EPSILON) * 100) / 100,
          previousActions: actionsByUser.get(row.user.id) ?? [],
        })),
    };
  }

  async recordAccountAction(params: {
    userId: string;
    actorId: string;
    action: string;
    reason: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.adminAccountAction.create({
      data: {
        userId: params.userId,
        actorId: params.actorId,
        action: params.action,
        reason: params.reason,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
