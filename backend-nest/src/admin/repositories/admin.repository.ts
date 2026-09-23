import { Injectable } from '@nestjs/common';
import { Prisma, Role, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BUTCHER_LISTING_COMMISSION_PERCENT,
  BUTCHER_ORDER_COMMISSION_PERCENT,
} from '../../lib/commissions';
import {
  notDeleted,
  retentionCutoff,
  softDeleteFields,
} from '../../common/utils/soft-delete.util';
import type { PaginationQueryDto } from '../dto/admin.dto';

const USER_SELECT = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  role: true,
  verified: true,
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
      this.prisma.butcherOffer.deleteMany({
        where: { validUntil: { lt: thirtyDaysAgo }, deletedAt: null },
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
      this.prisma.butcherStory.deleteMany({
        where: { deletedAt: { lt: archivedBefore } },
      }),
      this.prisma.butcherOffer.deleteMany({
        where: { deletedAt: { lt: archivedBefore } },
      }),
      this.prisma.butcherProduct.deleteMany({
        where: { deletedAt: { lt: archivedBefore }, orderItems: { none: {} } },
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

  async listUsers(query: PaginationQueryDto) {
    const { page, pageSize, search } = query;
    const where: Prisma.UserWhereInput = {
      ...notDeleted,
      ...searchOr(['username', 'email', 'arabicName', 'displayName'], search),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
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

  async listButchers(query: PaginationQueryDto) {
    const { page, pageSize, search } = query;
    const where: Prisma.ButcherWhereInput = {
      ...notDeleted,
      ...(search?.trim()
        ? {
            OR: [
              { nameAr: { contains: search.trim(), mode: 'insensitive' } },
              { nameEn: { contains: search.trim(), mode: 'insensitive' } },
              { cityAr: { contains: search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.butcher.findMany({
        where,
        include: { user: { select: AUTHOR_SELECT } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.butcher.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  updateButcher(id: string, data: Prisma.ButcherUpdateInput) {
    return this.prisma.butcher.update({
      where: { id },
      data,
      include: { user: { select: AUTHOR_SELECT } },
    });
  }

  findButcherById(id: string) {
    return this.prisma.butcher.findFirst({
      where: { id, ...notDeleted },
      include: {
        user: { select: OWNER_USER_SELECT },
        sourceApplication: {
          select: {
            id: true,
            applicationNumber: true,
            status: true,
            submittedAt: true,
          },
        },
      },
    });
  }

  /**
   * Soft-delete butcher + catalog rows. Orders/checkouts/reviews stay for history.
   */
  softDeleteButcher(id: string) {
    const now = softDeleteFields();
    return this.prisma.$transaction([
      this.prisma.butcherProduct.updateMany({
        where: { butcherId: id, deletedAt: null },
        data: { ...now, inStock: false },
      }),
      this.prisma.butcherOffer.updateMany({
        where: { butcherId: id, deletedAt: null },
        data: now,
      }),
      this.prisma.butcherStory.updateMany({
        where: { butcherId: id, deletedAt: null },
        data: now,
      }),
      this.prisma.butcher.update({
        where: { id },
        data: { ...now, isOpen: false },
      }),
    ]);
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
      totalButchers,
      verifiedButchers,
      ordersTotal,
      ordersToday,
      ordersYesterday,
      ordersPending,
      ordersCompleted,
      salesTodayAgg,
      salesYesterdayAgg,
      sales7dAgg,
      sales30dAgg,
      paymentsPaid,
      paymentsFailed,
      paymentsPending,
      paymentsRefunded,
      listingFeesPaidAgg,
      listingFeesPendingAgg,
      orderCommissionsAgg,
      usersRaw,
      ordersRaw,
      paymentsByDayRaw,
      reportsRaw,
      ticketsByCategory,
      recentOrders,
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
      this.prisma.butcher.count({ where: notDeleted }),
      this.prisma.butcher.count({ where: { ...notDeleted, type: 'verified' } }),
      this.prisma.butcherOrder.count(),
      this.prisma.butcherOrder.count({
        where: { createdAt: { gte: todayStart } },
      }),
      this.prisma.butcherOrder.count({
        where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
      }),
      this.prisma.butcherOrder.count({
        where: {
          status: { in: ['pending', 'confirmed', 'preparing', 'ready'] },
        },
      }),
      this.prisma.butcherOrder.count({ where: { status: 'delivered' } }),
      this.prisma.butcherOrder.aggregate({
        where: {
          status: 'delivered',
          createdAt: { gte: todayStart },
        },
        _sum: { totalPrice: true },
      }),
      this.prisma.butcherOrder.aggregate({
        where: {
          status: 'delivered',
          createdAt: { gte: yesterdayStart, lt: todayStart },
        },
        _sum: { totalPrice: true },
      }),
      this.prisma.butcherOrder.aggregate({
        where: {
          status: 'delivered',
          createdAt: { gte: sevenDaysAgo },
        },
        _sum: { totalPrice: true },
      }),
      this.prisma.butcherOrder.aggregate({
        where: {
          status: 'delivered',
          createdAt: { gte: thirtyDaysAgo },
        },
        _sum: { totalPrice: true },
      }),
      this.prisma.payment.count({
        where: {
          status: 'paid',
          OR: [
            { referenceType: null },
            { referenceType: { notIn: ['commission', 'order_commission'] } },
          ],
        },
      }),
      this.prisma.payment.count({
        where: {
          status: 'failed',
          OR: [
            { referenceType: null },
            { referenceType: { notIn: ['commission', 'order_commission'] } },
          ],
        },
      }),
      this.prisma.payment.count({
        where: {
          status: 'pending',
          OR: [
            { referenceType: null },
            { referenceType: { notIn: ['commission', 'order_commission'] } },
          ],
        },
      }),
      this.prisma.payment.count({
        where: {
          status: 'refunded',
          OR: [
            { referenceType: null },
            { referenceType: { notIn: ['commission', 'order_commission'] } },
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
      this.prisma.payment.aggregate({
        where: {
          status: 'paid',
          OR: [
            { referenceType: 'order_commission' },
            {
              referenceType: 'commission',
              orderId: { startsWith: 'BOC-' },
            },
          ],
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.user.findMany({
        take: 5000,
        where: { ...notDeleted, createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
      }),
      this.prisma.butcherOrder.findMany({
        take: 5000,
        where: { createdAt: { gte: thirtyDaysAgo }, status: 'delivered' },
        select: { createdAt: true, totalPrice: true },
      }),
      this.prisma.payment.findMany({
        take: 5000,
        where: {
          createdAt: { gte: thirtyDaysAgo },
          OR: [
            { referenceType: null },
            { referenceType: { notIn: ['commission', 'order_commission'] } },
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
      this.prisma.butcherOrder.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          orderNumber: true,
          totalPrice: true,
          currency: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
          customer: {
            select: { id: true, arabicName: true, displayName: true },
          },
          butcher: { select: { id: true, nameAr: true } },
        },
      }),
      this.prisma.payment.findMany({
        where: {
          OR: [
            { referenceType: null },
            { referenceType: { notIn: ['commission', 'order_commission'] } },
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

    const sales7 = fillDays(sevenDaysAgo, 7);
    const sales30 = fillDays(thirtyDaysAgo, 30);
    const orders7 = fillDays(sevenDaysAgo, 7);
    for (const o of ordersRaw) {
      const key = o.createdAt.toISOString().slice(0, 10);
      const amt = o.totalPrice ?? 0;
      if (sales7.has(key)) sales7.set(key, (sales7.get(key) ?? 0) + amt);
      if (sales30.has(key)) sales30.set(key, (sales30.get(key) ?? 0) + amt);
      if (orders7.has(key)) orders7.set(key, (orders7.get(key) ?? 0) + 1);
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
      butchers: { total: totalButchers, verified: verifiedButchers },
      orders: {
        total: ordersTotal,
        today: ordersToday,
        yesterday: ordersYesterday,
        pending: ordersPending,
        completed: ordersCompleted,
      },
      sales: {
        today: money(salesTodayAgg._sum.totalPrice),
        yesterday: money(salesYesterdayAgg._sum.totalPrice),
        last7Days: money(sales7dAgg._sum.totalPrice),
        last30Days: money(sales30dAgg._sum.totalPrice),
      },
      payments: {
        successful: paymentsPaid,
        failed: paymentsFailed,
        pending: paymentsPending,
        refunded: paymentsRefunded,
      },
      commission: {
        listingCommissionRatePercent: BUTCHER_LISTING_COMMISSION_PERCENT,
        orderCommissionRatePercent: BUTCHER_ORDER_COMMISSION_PERCENT,
        /** @deprecated Use listingCommissionRatePercent */
        butcherStoreRatePercent: BUTCHER_LISTING_COMMISSION_PERCENT,
        listingFeesPaidTotal: money(listingFeesPaidAgg._sum.commission),
        listingFeesPaidCount: listingFeesPaidAgg._count._all,
        listingFeesOutstandingTotal: money(
          listingFeesPendingAgg._sum.commission,
        ),
        listingFeesOutstandingCount: listingFeesPendingAgg._count._all,
        orderCommissionsTotal: money(orderCommissionsAgg._sum.amount),
        orderCommissionsCount: orderCommissionsAgg._count._all,
        totalCommission: money(
          (listingFeesPaidAgg._sum.commission ?? 0) +
            (orderCommissionsAgg._sum.amount ?? 0),
        ),
        noteAr:
          'عمولتان منفصلتان: (1) عمولة الإعلان 1% عبر ListingFee وفق تعهد البائع — (2) عمولة طلب الملحمة 10% عند delivered عبر Payment(referenceType=order_commission).',
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
        salesByDay: Array.from(sales7.entries()).map(([date, amount]) => ({
          date,
          amount: money(amount),
        })),
        salesByDay30: Array.from(sales30.entries()).map(([date, amount]) => ({
          date,
          amount: money(amount),
        })),
        ordersByDay: Array.from(orders7.entries()).map(([date, count]) => ({
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
        orders: recentOrders,
        payments: recentPayments,
        reports: recentReports,
      },
    };
  }

  async listOrders(query: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
    butcherId?: string;
    customerId?: string;
    dateFrom?: string;
    dateTo?: string;
    orderNumber?: string;
  }) {
    const { page, pageSize, search } = query;
    const createdAt: Prisma.DateTimeFilter | undefined =
      query.dateFrom || query.dateTo
        ? {
            ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
            ...(query.dateTo
              ? { lte: new Date(`${query.dateTo}T23:59:59.999Z`) }
              : {}),
          }
        : undefined;

    const where: Prisma.ButcherOrderWhereInput = {
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.butcherId ? { butcherId: query.butcherId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(query.orderNumber?.trim()
        ? {
            orderNumber: {
              contains: query.orderNumber.trim(),
              mode: 'insensitive',
            },
          }
        : {}),
      ...(search?.trim()
        ? {
            OR: [
              { orderNumber: { contains: search.trim(), mode: 'insensitive' } },
              { notes: { contains: search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.butcherOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          butcher: {
            select: { id: true, nameAr: true, nameEn: true, userId: true },
          },
          customer: {
            select: {
              id: true,
              arabicName: true,
              displayName: true,
              phone: true,
            },
          },
          product: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              availableQuantity: true,
              reservedQuantity: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  nameAr: true,
                  nameEn: true,
                  availableQuantity: true,
                  reservedQuantity: true,
                },
              },
            },
          },
          timeline: { orderBy: { createdAt: 'asc' } },
        },
      }),
      this.prisma.butcherOrder.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  getOrderById(orderId: string) {
    return this.prisma.butcherOrder.findUnique({
      where: { id: orderId },
      include: {
        butcher: {
          select: { id: true, nameAr: true, nameEn: true, userId: true },
        },
        customer: {
          select: {
            id: true,
            arabicName: true,
            displayName: true,
            phone: true,
          },
        },
        product: {
          include: { daftraLink: { select: { daftraSaleUnit: true } } },
        },
        items: {
          include: {
            product: {
              include: { daftraLink: { select: { daftraSaleUnit: true } } },
            },
          },
        },
        timeline: { orderBy: { createdAt: 'asc' } },
        audits: { orderBy: { changedAt: 'asc' } },
      },
    });
  }

  findPaymentIntegrationForButcherOrder(orderId: string) {
    return this.prisma.payment.findFirst({
      where: { referenceId: orderId, referenceType: 'butcher_order' },
      select: {
        id: true,
        orderId: true,
        status: true,
        amount: true,
        transactionId: true,
        checkoutUrl: true,
        integrationOrder: {
          select: {
            id: true,
            provider: true,
            status: true,
            merchantOrderReference: true,
            externalOrderId: true,
            lastError: true,
            retryCount: true,
            lastAttemptAt: true,
            syncedAt: true,
          },
        },
      },
    });
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
      {
        key: 'butcherApplicationsEnabled',
        value: true,
        labelAr: 'طلبات الملاحم',
        category: 'features',
      },
      // Paid listing services — show/hide independently in the app
      {
        key: 'features.paidPromotionEnabled',
        value: true,
        labelAr: 'ترويج الإعلان (الظهور المدفوع)',
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
        labelAr: 'ترويج الظهور — الحد الأدنى للميزانية كل 24 ساعة (ر.س)',
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
