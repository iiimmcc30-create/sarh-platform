import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  notDeleted,
  softDeleteFields,
} from '../../common/utils/soft-delete.util';

export type ButcherListSort =
  'rank' | 'rating' | 'favorites' | 'orders' | 'distance' | 'new';

const BUTCHER_LIST_INCLUDE = {
  user: { select: { id: true, username: true, avatar: true } },
  _count: { select: { products: true, orders: true, favorites: true } },
  offers: true,
} as const;

const BUTCHER_DETAIL_INCLUDE = {
  products: {
    where: { ...notDeleted },
    include: {
      daftraLink: { select: { daftraSaleUnit: true } },
    },
  },
  offers: true,
  reviews: {
    take: 10,
    orderBy: { createdAt: 'desc' as const },
    include: {
      reviewer: {
        select: { id: true, displayName: true, arabicName: true, avatar: true },
      },
    },
  },
  user: { select: { id: true, username: true, avatar: true } },
} as const;

const ORDER_CUSTOMER_SELECT = {
  id: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  phone: true,
} as const;

const ORDER_PRODUCT_INCLUDE = {
  include: {
    daftraLink: { select: { daftraSaleUnit: true } },
  },
} as const;

const BUTCHER_ORDER_LIST_INCLUDE = {
  customer: { select: ORDER_CUSTOMER_SELECT },
  product: ORDER_PRODUCT_INCLUDE,
  items: { include: { product: ORDER_PRODUCT_INCLUDE } },
  timeline: { orderBy: { createdAt: 'asc' as const } },
} as const;

@Injectable()
export class ButchersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyButchers(params: {
    where: Prisma.ButcherWhereInput;
    cursor?: string;
    take: number;
    sort?: ButcherListSort;
    lat?: number;
    lng?: number;
  }) {
    const { where, cursor, take, sort = 'rank', lat, lng } = params;

    if (sort === 'distance' && lat != null && lng != null) {
      return this.findManyButchersByDistance({ where, cursor, take, lat, lng });
    }

    const orderBy = this.buildOrderBy(sort);

    return this.prisma.butcher.findMany({
      where,
      take,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy,
      include: BUTCHER_LIST_INCLUDE,
    });
  }

  private buildOrderBy(
    sort: ButcherListSort,
  ): Prisma.ButcherOrderByWithRelationInput[] {
    const tieBreakers: Prisma.ButcherOrderByWithRelationInput[] = [
      { completedOrdersCount: 'desc' },
      { rating: 'desc' },
      { favoritesCount: 'desc' },
      { normalizedSpeed: 'desc' },
      { createdAt: 'desc' },
      { id: 'asc' },
    ];

    switch (sort) {
      case 'rating':
        return [{ rating: 'desc' }, { rankingScore: 'desc' }, ...tieBreakers];
      case 'favorites':
        return [
          { favoritesCount: 'desc' },
          { rankingScore: 'desc' },
          ...tieBreakers,
        ];
      case 'orders':
        return [
          { completedOrdersCount: 'desc' },
          { rankingScore: 'desc' },
          ...tieBreakers,
        ];
      case 'new':
        return [
          { newButcherBoost: 'desc' },
          { createdAt: 'desc' },
          { rankingScore: 'desc' },
        ];
      case 'rank':
      default:
        return [{ rankingScore: 'desc' }, ...tieBreakers];
    }
  }

  private async findManyButchersByDistance(params: {
    where: Prisma.ButcherWhereInput;
    cursor?: string;
    take: number;
    lat: number;
    lng: number;
  }) {
    const { where, cursor, take, lat, lng } = params;
    const ids = await this.prisma.butcher.findMany({
      take: 2000,
      where,
      select: { id: true },
    });
    if (ids.length === 0) return [];

    const idList = ids.map((r) => r.id);
    const rows = await this.prisma.$queryRaw<{ id: string; dist_km: number }[]>`
      SELECT b.id,
        (
          6371 * acos(
            LEAST(1, GREATEST(-1,
              cos(radians(${lat})) * cos(radians(b.lat)) *
              cos(radians(b.lng) - radians(${lng})) +
              sin(radians(${lat})) * sin(radians(b.lat))
            ))
          )
        ) AS dist_km
      FROM "Butcher" b
      WHERE b.id = ANY(${idList}::text[])
        AND b."deletedAt" IS NULL
        AND b.lat IS NOT NULL
        AND b.lng IS NOT NULL
      ORDER BY dist_km ASC, b."rankingScore" DESC, b."completedOrdersCount" DESC
      LIMIT ${take + 1}
    `;

    const orderedIds = rows.map((r) => r.id);
    if (orderedIds.length === 0) {
      return this.prisma.butcher.findMany({
        where,
        take,
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
        orderBy: this.buildOrderBy('rank'),
        include: BUTCHER_LIST_INCLUDE,
      });
    }

    let startIdx = 0;
    if (cursor) {
      const idx = orderedIds.indexOf(cursor);
      startIdx = idx >= 0 ? idx + 1 : 0;
    }
    const pageIds = orderedIds.slice(startIdx, startIdx + take + 1);

    const butchers = await this.prisma.butcher.findMany({
      take: Math.max(pageIds.length, 1),
      where: { id: { in: pageIds } },
      include: BUTCHER_LIST_INCLUDE,
    });
    const byId = new Map(butchers.map((b) => [b.id, b]));
    return pageIds.map((id) => byId.get(id)).filter(Boolean) as typeof butchers;
  }

  findButcherById(id: string) {
    return this.prisma.butcher.findFirst({
      where: { id, ...notDeleted },
      include: BUTCHER_DETAIL_INCLUDE,
    });
  }

  findButcherByUserId(userId: string) {
    return this.prisma.butcher.findFirst({
      where: { userId, ...notDeleted },
      include: BUTCHER_DETAIL_INCLUDE,
    });
  }

  findButcherOwner(id: string) {
    return this.prisma.butcher.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
  }

  findButcherOwnerByUser(userId: string) {
    return this.prisma.butcher.findUnique({
      where: { userId },
      select: { id: true, userId: true },
    });
  }

  incrementProfileViews(id: string) {
    return this.prisma.butcher.update({
      where: { id },
      data: { profileViews: { increment: 1 } },
    });
  }

  updateButcher(id: string, data: Prisma.ButcherUpdateInput) {
    return this.prisma.butcher.update({ where: { id }, data });
  }

  findButcherForStats(userId: string) {
    return this.prisma.butcher.findUnique({
      where: { userId },
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        isOpen: true,
        profileViews: true,
        rating: true,
        reviewCount: true,
        subscriptionActive: true,
      },
    });
  }

  findOrdersInRange(butcherId: string, from: Date, to?: Date) {
    return this.prisma.butcherOrder.findMany({
      take: 2000,
      where: {
        butcherId,
        createdAt: to ? { gte: from, lt: to } : { gte: from },
      },
      include: to ? undefined : { product: { select: { nameAr: true } } },
    });
  }

  findProducts(butcherId: string) {
    return this.prisma.butcherProduct.findMany({
      take: 200,
      where: { butcherId, ...notDeleted },
      orderBy: { createdAt: 'desc' },
      include: {
        daftraLink: { select: { daftraSaleUnit: true } },
      },
    });
  }

  createProduct(data: Prisma.ButcherProductUncheckedCreateInput) {
    return this.prisma.butcherProduct.create({ data });
  }

  findProductWithButcher(id: string) {
    return this.prisma.butcherProduct.findFirst({
      where: { id, ...notDeleted },
      include: { butcher: { select: { userId: true, id: true } } },
    });
  }

  updateProduct(id: string, data: Prisma.ButcherProductUpdateInput) {
    return this.prisma.butcherProduct.update({ where: { id }, data });
  }

  softDeleteProduct(id: string) {
    return this.prisma.butcherProduct.update({
      where: { id },
      data: { ...softDeleteFields(), inStock: false },
    });
  }

  findButcherIdByUser(userId: string) {
    return this.prisma.butcher.findUnique({
      where: { userId },
      select: { id: true },
    });
  }

  findActiveOffers(butcherId: string) {
    return this.prisma.butcherOffer.findMany({
      take: 100,
      where: { butcherId, validUntil: { gte: new Date() }, ...notDeleted },
      orderBy: { createdAt: 'desc' },
    });
  }

  createOffer(data: Prisma.ButcherOfferUncheckedCreateInput) {
    return this.prisma.butcherOffer.create({ data });
  }

  findOwnedOffer(offerId: string, userId: string) {
    return this.prisma.butcherOffer.findFirst({
      where: { id: offerId, butcher: { userId } },
      select: { id: true, butcherId: true },
    });
  }

  updateOffer(id: string, data: Prisma.ButcherOfferUpdateInput) {
    return this.prisma.butcherOffer.update({ where: { id }, data });
  }

  softDeleteOffer(id: string) {
    return this.prisma.butcherOffer.update({
      where: { id },
      data: softDeleteFields(),
    });
  }

  findOrdersForButcher(butcherId: string) {
    return this.prisma.butcherOrder.findMany({
      take: 200,
      where: { butcherId },
      orderBy: { createdAt: 'desc' },
      include: BUTCHER_ORDER_LIST_INCLUDE,
    });
  }

  findOrdersForCustomer(customerId: string) {
    return this.prisma.butcherOrder.findMany({
      take: 200,
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        butcher: true,
        product: ORDER_PRODUCT_INCLUDE,
        items: { include: { product: ORDER_PRODUCT_INCLUDE } },
        timeline: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  findOrdersPage(
    where: Prisma.ButcherOrderWhereInput,
    skip: number,
    take: number,
    forCustomer: boolean,
  ) {
    return this.prisma.butcherOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: forCustomer
        ? {
            butcher: true,
            product: ORDER_PRODUCT_INCLUDE,
            items: { include: { product: ORDER_PRODUCT_INCLUDE } },
            timeline: { orderBy: { createdAt: 'asc' as const } },
          }
        : BUTCHER_ORDER_LIST_INCLUDE,
    });
  }

  countOrders(where: Prisma.ButcherOrderWhereInput) {
    return this.prisma.butcherOrder.count({ where });
  }

  groupOrderStatusCounts(butcherId: string) {
    return this.prisma.butcherOrder.groupBy({
      by: ['status'],
      where: { butcherId },
      _count: { _all: true },
    });
  }

  sumSalesSince(butcherId: string, from: Date) {
    return this.prisma.butcherOrder.aggregate({
      where: {
        butcherId,
        createdAt: { gte: from },
        status: { not: 'cancelled' },
      },
      _sum: { totalPrice: true },
      _count: { _all: true },
    });
  }

  countOrdersSince(
    butcherId: string,
    from: Date,
    status: Prisma.EnumOrderStatusFilter['equals'],
  ) {
    return this.prisma.butcherOrder.count({
      where: { butcherId, createdAt: { gte: from }, status },
    });
  }

  findRecentOrdersForButcher(butcherId: string, take: number) {
    return this.prisma.butcherOrder.findMany({
      where: { butcherId },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        customer: {
          select: {
            id: true,
            displayName: true,
            arabicName: true,
            avatar: true,
          },
        },
        product: { select: { id: true, nameAr: true } },
      },
    });
  }

  findProductsInventory(butcherId: string) {
    return this.prisma.butcherProduct.findMany({
      take: 500,
      where: { butcherId, ...notDeleted },
      select: {
        id: true,
        nameAr: true,
        inStock: true,
        availableQuantity: true,
        reservedQuantity: true,
      },
      orderBy: { nameAr: 'asc' },
    });
  }

  findAcceptedOrderForChat(customerId: string, butcherId: string) {
    return this.prisma.butcherOrder.findFirst({
      where: {
        customerId,
        butcherId,
        status: { in: ['confirmed', 'preparing', 'ready', 'delivered'] },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, status: true },
    });
  }

  findProductForOrder(productId: string) {
    return this.prisma.butcherProduct.findUnique({
      where: { id: productId },
      select: {
        id: true,
        butcherId: true,
        inStock: true,
        weightMin: true,
        weightMax: true,
        priceFixed: true,
        pricePerKg: true,
        daftraLink: { select: { daftraSaleUnit: true } },
      },
    });
  }

  findOrderWithButcher(id: string) {
    return this.prisma.butcherOrder.findUnique({
      where: { id },
      include: { butcher: { select: { userId: true, id: true } } },
    });
  }

  findOrderById(id: string) {
    return this.prisma.butcherOrder.findUnique({
      where: { id },
      include: {
        butcher: true,
        customer: {
          select: {
            id: true,
            displayName: true,
            arabicName: true,
            avatar: true,
            phone: true,
          },
        },
        product: ORDER_PRODUCT_INCLUDE,
        items: { include: { product: ORDER_PRODUCT_INCLUDE } },
        timeline: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  findOrderAudits(orderId: string) {
    return this.prisma.orderStatusAudit.findMany({
      take: 200,
      where: { orderId },
      orderBy: { changedAt: 'asc' },
    });
  }

  findActiveStories() {
    return this.prisma.butcherStory.findMany({
      take: 100,
      where: { expiresAt: { gt: new Date() }, ...notDeleted },
      orderBy: { createdAt: 'desc' },
      include: {
        butcher: {
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            logo: true,
            subscriptionActive: true,
            country: true,
          },
        },
      },
    });
  }

  createStory(data: Prisma.ButcherStoryUncheckedCreateInput) {
    return this.prisma.butcherStory.create({
      data,
      include: {
        butcher: {
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            logo: true,
            subscriptionActive: true,
            country: true,
          },
        },
      },
    });
  }

  findStoryWithButcher(id: string) {
    return this.prisma.butcherStory.findUnique({
      where: { id },
      include: { butcher: { select: { userId: true } } },
    });
  }

  softDeleteStory(id: string) {
    return this.prisma.butcherStory.update({
      where: { id },
      data: softDeleteFields(),
    });
  }

  findButcherForReview(id: string) {
    return this.prisma.butcher.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
  }

  findReviews(butcherId: string) {
    return this.prisma.butcherReview.findMany({
      where: { butcherId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        reviewer: {
          select: {
            id: true,
            displayName: true,
            arabicName: true,
            avatar: true,
            verified: true,
          },
        },
      },
    });
  }

  upsertReview(params: {
    butcherId: string;
    reviewerId: string;
    rating: number;
    comment?: string;
  }) {
    const { butcherId, reviewerId, rating, comment } = params;
    return this.prisma.butcherReview.upsert({
      where: { butcherId_reviewerId: { butcherId, reviewerId } },
      update: { rating, comment },
      create: { butcherId, reviewerId, rating, comment },
      include: {
        reviewer: {
          select: {
            id: true,
            displayName: true,
            arabicName: true,
            avatar: true,
          },
        },
      },
    });
  }

  aggregateReviews(butcherId: string) {
    return this.prisma.butcherReview.aggregate({
      where: { butcherId },
      _avg: { rating: true },
      _count: { rating: true },
    });
  }

  updateButcherRating(butcherId: string, rating: number, reviewCount: number) {
    return this.prisma.butcher.update({
      where: { id: butcherId },
      data: { rating, reviewCount },
    });
  }

  findDeliveredOrderForReview(butcherId: string, customerId: string) {
    return this.prisma.butcherOrder.findFirst({
      where: { butcherId, customerId, status: 'delivered' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
  }

  findReviewByButcherAndUser(butcherId: string, reviewerId: string) {
    return this.prisma.butcherReview.findUnique({
      where: { butcherId_reviewerId: { butcherId, reviewerId } },
    });
  }

  aggregateReviewDistribution(butcherId: string) {
    return this.prisma.butcherReview.groupBy({
      by: ['rating'],
      where: { butcherId },
      _count: { rating: true },
    });
  }

  addFavorite(butcherId: string, userId: string) {
    return this.prisma.butcherFavorite.create({
      data: { butcherId, userId },
    });
  }

  removeFavorite(butcherId: string, userId: string) {
    return this.prisma.butcherFavorite.delete({
      where: { butcherId_userId: { butcherId, userId } },
    });
  }

  isFavorited(butcherId: string, userId: string) {
    return this.prisma.butcherFavorite.findUnique({
      where: { butcherId_userId: { butcherId, userId } },
      select: { id: true },
    });
  }

  countFavorites(butcherId: string) {
    return this.prisma.butcherFavorite.count({ where: { butcherId } });
  }

  findOrdersForReports(butcherId: string, from: Date, to: Date) {
    return this.prisma.butcherOrder.findMany({
      take: 2000,
      where: {
        butcherId,
        createdAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        customerId: true,
        productId: true,
        status: true,
        paymentStatus: true,
        totalPrice: true,
        createdAt: true,
        product: { select: { id: true, nameAr: true } },
        items: {
          select: {
            productId: true,
            linePrice: true,
            weightKg: true,
            product: { select: { id: true, nameAr: true } },
          },
        },
      },
    });
  }

  async findCustomersPage(
    butcherId: string,
    search: string | undefined,
    skip: number,
    take: number,
  ) {
    const pattern = search ? `%${search.replace(/[%_]/g, '')}%` : null;
    const rows = await this.prisma.$queryRaw<
      Array<{
        customerId: string;
        arabicName: string;
        displayName: string;
        phone: string | null;
        avatar: string | null;
        orderCount: number;
        paidTotal: number;
        lastOrderAt: Date;
        lastOrderNumber: string | null;
      }>
    >`
      SELECT
        o."customerId" AS "customerId",
        u."arabicName" AS "arabicName",
        u."displayName" AS "displayName",
        u.phone AS phone,
        u.avatar AS avatar,
        COUNT(*)::int AS "orderCount",
        COALESCE(
          SUM(
            CASE
              WHEN o."paymentStatus" = 'paid' AND o.status <> 'cancelled'
              THEN o."totalPrice" ELSE 0
            END
          ),
          0
        )::float AS "paidTotal",
        MAX(o."createdAt") AS "lastOrderAt",
        (
          SELECT b."orderNumber"
          FROM "ButcherOrder" b
          WHERE b."butcherId" = o."butcherId"
            AND b."customerId" = o."customerId"
          ORDER BY b."createdAt" DESC
          LIMIT 1
        ) AS "lastOrderNumber"
      FROM "ButcherOrder" o
      INNER JOIN "User" u ON u.id = o."customerId"
      WHERE o."butcherId" = ${butcherId}
        ${
          pattern
            ? Prisma.sql`AND (
                u."arabicName" ILIKE ${pattern}
                OR u."displayName" ILIKE ${pattern}
                OR COALESCE(u.phone, '') ILIKE ${pattern}
              )`
            : Prisma.sql``
        }
      GROUP BY o."customerId", o."butcherId", u."arabicName", u."displayName", u.phone, u.avatar
      ORDER BY MAX(o."createdAt") DESC
      OFFSET ${skip}
      LIMIT ${take}
    `;
    return rows;
  }

  async countCustomers(butcherId: string, search: string | undefined) {
    const pattern = search ? `%${search.replace(/[%_]/g, '')}%` : null;
    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT o."customerId"
        FROM "ButcherOrder" o
        INNER JOIN "User" u ON u.id = o."customerId"
        WHERE o."butcherId" = ${butcherId}
          ${
            pattern
              ? Prisma.sql`AND (
                  u."arabicName" ILIKE ${pattern}
                  OR u."displayName" ILIKE ${pattern}
                  OR COALESCE(u.phone, '') ILIKE ${pattern}
                )`
              : Prisma.sql``
          }
        GROUP BY o."customerId"
      ) t
    `;
    return rows[0]?.count ?? 0;
  }
}
