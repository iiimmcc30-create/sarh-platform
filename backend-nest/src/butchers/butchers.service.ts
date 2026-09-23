import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { ButchersRepository } from './repositories/butchers.repository';
import { RedisService } from '../redis/redis.service';
import { throwApi, ApiException } from '../common/exceptions/api.exception';
import { notDeleted } from '../common/utils/soft-delete.util';
import { countrySchema } from '../shared/lib/countries';
import { logger } from '../shared/lib/logger';
import {
  STORY_IMAGE_DURATION_SEC,
  clampStoryDuration,
  storyExpiresAt,
} from '../shared/lib/stories';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { OrderLifecycleService } from './services/order-lifecycle.service';
import { OrderStateMachineService } from './services/order-state-machine.service';
import { ButcherRankingService } from './services/butcher-ranking.service';
import { REVIEW_EDIT_WINDOW_DAYS } from './lib/butcher-ranking.util';
import type { ButcherListSort } from './repositories/butchers.repository';
import {
  classifyProductStock,
  LOW_STOCK_DISPLAY_THRESHOLD_KG,
  resolveProductAvailableQuantity,
  sellableQuantity,
} from './lib/product-inventory.util';
import {
  buildOrderListWhere,
  parseOrderListQuery,
  startOfTodayRiyadh,
} from './lib/order-list-query';
import {
  isoWeekKeyFromDay,
  parseReportsQuery,
  riyadhCalendarDay,
} from './lib/reports-query';
import { isCompletedSale, SALES_DEFINITION } from './lib/sales.util';
import {
  sumOrderLinePrices,
  validateAndPriceOrderLine,
} from './lib/order-line.util';
import { PaymentsService } from '../payments/payments.service';

const PAGE_SIZE = 20;

const updateButcherSchema = z
  .object({
    nameAr: z.string().min(2).max(100).trim().optional(),
    nameEn: z.string().min(2).max(100).trim().optional(),
    logo: z.string().url().optional().nullable(),
    cover: z.string().url().optional().nullable(),
    bioAr: z.string().max(500).trim().optional().nullable(),
    bioEn: z.string().max(500).trim().optional().nullable(),
    specialties: z.array(z.string()).optional(),
    commercialReg: z.string().max(50).trim().optional().nullable(),
    phone: z
      .string()
      .regex(/^\+?[0-9]{8,20}$/, 'رقم هاتف غير صالح')
      .optional(),
    openTime: z
      .string()
      .regex(/^([0-9]{2}):([0-9]{2})$/)
      .optional(),
    closeTime: z
      .string()
      .regex(/^([0-9]{2}):([0-9]{2})$/)
      .optional(),
    closedDays: z.array(z.string()).optional(),
    address: z.string().min(5).max(300).trim().optional(),
    addressAr: z.string().min(5).max(300).trim().optional(),
    city: z.string().min(2).max(100).trim().optional(),
    cityAr: z.string().min(2).max(100).trim().optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    country: countrySchema.optional(),
    isOpen: z.boolean().optional(),
  })
  .strict();

const periodSchema = z.enum(['week', 'month', '3months']);

const createProductSchema = z
  .object({
    nameAr: z.string().min(2).max(100).trim(),
    nameEn: z.string().min(2).max(100).trim(),
    category: z.enum([
      'whole_livestock',
      'lamb',
      'beef',
      'camel',
      'chicken',
      'goat',
      'special_orders',
    ]),
    images: z.array(z.string().url()).min(0).max(5).default([]),
    pricePerKg: z.number().positive().optional().nullable(),
    priceFixed: z.number().positive().optional().nullable(),
    pricingNoteAr: z.string().max(100).optional().nullable(),
    availableCuts: z.array(z.string()).min(1),
    weightMin: z.number().positive().optional().nullable(),
    weightMax: z.number().positive().optional().nullable(),
    availableQuantity: z.number().min(0).optional().nullable(),
    inStock: z.boolean().optional(),
    freshness: z.string().default('fresh'),
    descriptionAr: z.string().min(5).max(1000).trim(),
    descriptionEn: z.string().min(5).max(1000).trim(),
    country: countrySchema,
  })
  .strict();

const updateProductSchema = z
  .object({
    nameAr: z.string().min(2).max(100).trim().optional(),
    nameEn: z.string().min(2).max(100).trim().optional(),
    category: z
      .enum([
        'whole_livestock',
        'lamb',
        'beef',
        'camel',
        'chicken',
        'goat',
        'special_orders',
      ])
      .optional(),
    images: z.array(z.string().url()).min(0).max(5).optional(),
    pricePerKg: z.number().positive().optional().nullable(),
    priceFixed: z.number().positive().optional().nullable(),
    pricingNoteAr: z.string().max(100).optional().nullable(),
    availableCuts: z.array(z.string()).optional(),
    weightMin: z.number().positive().optional().nullable(),
    weightMax: z.number().positive().optional().nullable(),
    availableQuantity: z.number().min(0).optional().nullable(),
    inStock: z.boolean().optional(),
    freshness: z.string().optional(),
    descriptionAr: z.string().min(5).max(1000).trim().optional(),
    descriptionEn: z.string().min(5).max(1000).trim().optional(),
  })
  .strict();

const createOfferSchema = z
  .object({
    titleAr: z.string().min(2).max(100),
    titleEn: z.string().min(2).max(100),
    descriptionAr: z.string().min(2).max(500),
    descriptionEn: z.string().min(2).max(500),
    discountPercent: z.number().min(0).max(100).optional().nullable(),
    originalPrice: z.number().positive().optional().nullable(),
    offerPrice: z.number().positive().optional().nullable(),
    image: z.string().url(),
    validUntil: z.string().datetime(),
    country: countrySchema,
  })
  .strict();

const updateOfferSchema = z
  .object({
    titleAr: z.string().min(2).max(100).optional(),
    titleEn: z.string().min(2).max(100).optional(),
    descriptionAr: z.string().min(2).max(500).optional(),
    descriptionEn: z.string().min(2).max(500).optional(),
    discountPercent: z.number().min(0).max(100).optional().nullable(),
    originalPrice: z.number().positive().optional().nullable(),
    offerPrice: z.number().positive().optional().nullable(),
    image: z.string().url().optional(),
    validUntil: z.string().datetime().optional(),
    country: countrySchema.optional(),
  })
  .strict();

const orderLineSchema = z
  .object({
    productId: z.string().uuid(),
    cutType: z.string(),
    weightKg: z.number().positive(),
  })
  .strict();

const createOrderHeaderSchema = z.object({
  butcherId: z.string().uuid(),
  deliveryType: z.enum(['pickup', 'delivery']),
  deliveryAddress: z.string().max(300).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  currency: z.string().length(3).default('SAR'),
});

const createOrderSchema = z.union([
  createOrderHeaderSchema
    .extend({
      productId: z.string().uuid(),
      cutType: z.string(),
      weightKg: z.number().positive(),
    })
    .strict(),
  createOrderHeaderSchema
    .extend({
      items: z.array(orderLineSchema).min(1).max(30),
    })
    .strict(),
]);

const updateOrderSchema = z
  .object({
    status: z.enum([
      'pending',
      'confirmed',
      'preparing',
      'ready',
      'delivered',
      'cancelled',
    ]),
    cancellationReason: z.string().max(500).optional().nullable(),
  })
  .strict();

const createStorySchema = z
  .object({
    thumbnail: z.string().url(),
    mediaUrl: z.string().url().optional().nullable(),
    caption: z.string().max(200).optional().nullable(),
    captionAr: z.string().max(200).optional().nullable(),
    type: z.enum(['daily_slaughter', 'offer', 'new_stock', 'update']),
    duration: z.number().int().min(5).max(15).optional(),
  })
  .strict();

const reviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(500).optional(),
  })
  .strict();

function periodDays(period: string): number {
  if (period === 'week') return 7;
  if (period === '3months') return 90;
  return 30;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

@Injectable()
export class ButchersService {
  private readonly inFlightCheckouts = new Map<string, Promise<unknown>>();

  constructor(
    private readonly repo: ButchersRepository,
    private readonly redis: RedisService,
    private readonly orderLifecycle: OrderLifecycleService,
    private readonly orderStateMachine: OrderStateMachineService,
    private readonly ranking: ButcherRankingService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly payments?: PaymentsService,
  ) {}

  async listButchers(query: {
    cursor?: string;
    country?: string;
    verified?: string;
    search?: string;
    isOpen?: string;
    sort?: string;
    lat?: string;
    lng?: string;
  }) {
    const { cursor, country, search } = query;
    const isOpen = query.isOpen === 'true';
    const sort = this.parseSort(query.sort);
    const lat = query.lat ? Number(query.lat) : undefined;
    const lng = query.lng ? Number(query.lng) : undefined;

    const cacheKey = !search
      ? `butchers:v4:${JSON.stringify({ cursor, country, isOpen, sort, lat, lng })}`
      : null;

    if (cacheKey) {
      const cached = await this.redis.cacheGet(cacheKey);
      if (cached) return cached;
    }

    const where: Prisma.ButcherWhereInput = { ...notDeleted };
    if (country) where.country = country as Prisma.ButcherWhereInput['country'];
    if (isOpen) where.isOpen = true;
    if (search && search.length >= 2) {
      where.OR = [
        { nameAr: { contains: search } },
        { nameEn: { contains: search, mode: 'insensitive' } },
        { cityAr: { contains: search } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    const butchers = await this.repo.findManyButchers({
      where,
      cursor,
      take: PAGE_SIZE + 1,
      sort,
      lat,
      lng,
    });

    const hasMore = butchers.length > PAGE_SIZE;
    const items = hasMore ? butchers.slice(0, -1) : butchers;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;
    const result = { butchers: items, nextCursor, hasMore };

    if (cacheKey) await this.redis.cacheSet(cacheKey, result, 180);
    return result;
  }

  private parseSort(raw?: string): ButcherListSort {
    const allowed: ButcherListSort[] = [
      'rank',
      'rating',
      'favorites',
      'orders',
      'distance',
      'new',
    ];
    if (raw && allowed.includes(raw as ButcherListSort)) {
      return raw as ButcherListSort;
    }
    return 'rank';
  }

  registerButcher() {
    throwApi(
      403,
      'application_required',
      'يجب تقديم طلب تسجيل ملحمة والحصول على موافقة الإدارة. استخدم بوابة طلبات التسجيل في التطبيق.',
    );
  }

  async getButcher(id: string, viewer?: JwtPayload) {
    if (!id) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const isMe = id === 'me';
    const viewerId = viewer?.userId;

    if (!isMe) {
      const existing = await this.repo.findButcherOwner(id);
      if (!existing) throwApi(404, 'not_found', 'الملحمة غير موجودة');
      if (existing.userId !== viewerId) {
        await this.repo.incrementProfileViews(id);
      }
    }

    let butcher;
    if (isMe) {
      if (!viewer?.userId) throwApi(401, 'unauthorized', 'غير مصرح');
      // Never cache `/butchers/me` under a shared key — that would leak
      // Butcher A profile to Butcher B. Resolve strictly from JWT userId.
      butcher = await this.repo.findButcherByUserId(viewer.userId);
    } else {
      butcher = await this.repo.findButcherById(id);
    }

    if (!butcher) throwApi(404, 'not_found', 'الملحمة غير موجودة');
    return butcher;
  }

  async getChatAccess(butcherId: string, user?: JwtPayload) {
    if (!butcherId) throwApi(400, 'invalid_id', 'معرّف غير صالح');
    const butcher = await this.repo.findButcherById(butcherId);
    if (!butcher) throwApi(404, 'not_found', 'الملحمة غير موجودة');

    if (!user?.userId) {
      return {
        allowed: false,
        reason: 'login_required',
        messageAr: 'التواصل المباشر مع الملحمة غير متاح',
      };
    }

    return {
      allowed: false,
      reason: 'direct_chat_disabled',
      messageAr: 'التواصل المباشر مع الملحمة غير متاح',
      receiverId: butcher.userId,
    };
  }

  async updateButcher(id: string, user: JwtPayload, body: unknown) {
    if (!id) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const butcher =
      id === 'me'
        ? await this.repo.findButcherOwnerByUser(user.userId)
        : await this.repo.findButcherOwner(id);

    if (!butcher) throwApi(404, 'not_found', 'الملحمة غير موجودة');
    if (butcher.userId !== user.userId && user.role !== 'ADMIN') {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    const parsed = updateButcherSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const updated = await this.repo.updateButcher(butcher.id, parsed.data);

    await this.redis.cacheDel(`butcher:${id}`);
    await this.redis.cacheDel('butcher:me');
    await this.redis.cacheDel(`butcher:${butcher.id}`);
    await this.redis.cacheDelPattern('butchers:v2:*').catch(() => {});

    logger.info(
      { butcherId: butcher.id, userId: user.userId },
      'Butcher profile updated',
    );
    return updated;
  }

  async getStats(user: JwtPayload, periodRaw?: string) {
    const parsed = periodSchema.safeParse(periodRaw ?? 'month');
    if (!parsed.success) {
      throwApi(400, 'validation_error', 'فترة غير صالحة');
    }

    const period = parsed.data;
    const days = periodDays(period);
    const now = new Date();
    const limitDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevLimitDate = new Date(
      limitDate.getTime() - days * 24 * 60 * 60 * 1000,
    );

    const butcher = await this.repo.findButcherForStats(user.userId);
    if (!butcher) {
      throwApi(404, 'not_found', 'لم يتم العثور على ملحمة مرتبطة بحسابك');
    }

    const butcherStats = butcher;

    const [currentOrders, previousOrders] = await Promise.all([
      this.repo.findOrdersInRange(butcherStats.id, limitDate),
      this.repo.findOrdersInRange(butcherStats.id, prevLimitDate, limitDate),
    ]);

    const validOrders = currentOrders.filter((o) => o.status !== 'cancelled');
    const prevValid = previousOrders.filter((o) => o.status !== 'cancelled');

    const revenue = validOrders.reduce((s, o) => s + o.totalPrice, 0);
    const prevRevenue = prevValid.reduce((s, o) => s + o.totalPrice, 0);

    const deliveredCount = currentOrders.filter(
      (o) => o.status === 'delivered',
    ).length;
    const cancelledCount = currentOrders.filter(
      (o) => o.status === 'cancelled',
    ).length;
    const totalStatusCount = deliveredCount + cancelledCount;
    const completionRate =
      totalStatusCount > 0
        ? Math.round((deliveredCount / totalStatusCount) * 100)
        : 100;

    const avgOrderValue =
      validOrders.length > 0 ? Math.round(revenue / validOrders.length) : 0;

    const newCustomers = new Set(currentOrders.map((o) => o.customerId)).size;

    const dailyMap: Record<string, number> = {};
    validOrders.forEach((o) => {
      const dateStr = o.createdAt.toISOString().slice(0, 10);
      dailyMap[dateStr] = (dailyMap[dateStr] ?? 0) + o.totalPrice;
    });
    const dailyRevenue = Object.values(dailyMap).slice(-7);
    if (dailyRevenue.length === 0) dailyRevenue.push(0);

    const productMap: Record<string, { sales: number; revenue: number }> = {};
    validOrders.forEach((o) => {
      const name =
        (o as { product?: { nameAr?: string } }).product?.nameAr ?? 'منتج';
      if (!productMap[name]) productMap[name] = { sales: 0, revenue: 0 };
      productMap[name].sales += 1;
      productMap[name].revenue += o.totalPrice;
    });
    const topProducts = Object.entries(productMap)
      .map(([name, stats]) => ({
        name,
        sales: stats.sales,
        revenue: stats.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3);

    const prevOrderCount = previousOrders.length;
    const orderCount = currentOrders.length;

    return {
      period,
      butcher: {
        id: butcherStats.id,
        nameAr: butcherStats.nameAr,
        subscriptionActive: butcherStats.subscriptionActive,
      },
      revenue,
      orders: orderCount,
      profileViews: butcherStats.profileViews,
      completionRate,
      avgOrderValue,
      newCustomers,
      dailyRevenue,
      topProducts,
      reviews: { avg: butcherStats.rating, count: butcherStats.reviewCount },
      trends: {
        revenue: pctChange(revenue, prevRevenue),
        orders: pctChange(orderCount, prevOrderCount),
        profileViews: null,
        completionRate: null,
      },
    };
  }

  async getProducts(butcherId: string) {
    if (!butcherId) throwApi(400, 'invalid_butcher_id', 'معرّف الملحمة مطلوب');
    return this.repo.findProducts(butcherId);
  }

  async getMyProducts(user: JwtPayload) {
    const butcher = await this.repo.findButcherIdByUser(user.userId);
    if (!butcher) {
      throwApi(403, 'no_butcher_profile', 'ليس لديك ملف ملحمة مسجل');
    }
    const products = await this.repo.findProducts(butcher.id);
    return products.map((product) => ({
      ...product,
      sellableQuantity: sellableQuantity(product),
      stock: classifyProductStock(product),
    }));
  }

  async getCustomers(user: JwtPayload, rawQuery: Record<string, unknown> = {}) {
    const butcher = await this.repo.findButcherIdByUser(user.userId);
    if (!butcher) {
      throwApi(403, 'no_butcher_profile', 'ليس لديك ملف ملحمة مسجل');
    }
    const parsed = parseOrderListQuery({
      page: rawQuery.page ?? '1',
      limit: rawQuery.limit ?? '20',
      q: rawQuery.q,
      search: rawQuery.search,
    });
    if (!parsed.ok) {
      throwApi(400, 'validation_error', parsed.message);
    }
    const skip = (parsed.query.page - 1) * parsed.query.limit;
    const [rows, total] = await Promise.all([
      this.repo.findCustomersPage(
        butcher.id,
        parsed.query.search,
        skip,
        parsed.query.limit,
      ),
      this.repo.countCustomers(butcher.id, parsed.query.search),
    ]);
    const items = rows.map((row) => ({
      customerId: row.customerId,
      name: row.arabicName || row.displayName || 'عميل',
      arabicName: row.arabicName,
      displayName: row.displayName,
      phone: row.phone,
      avatar: row.avatar,
      orderCount: Number(row.orderCount),
      paidTotal: Number(row.paidTotal),
      lastOrderAt: row.lastOrderAt,
      lastOrderNumber: row.lastOrderNumber,
    }));
    return {
      items,
      total: Number(total),
      page: parsed.query.page,
      limit: parsed.query.limit,
      hasMore: skip + items.length < Number(total),
    };
  }

  async getReports(user: JwtPayload, rawQuery: Record<string, unknown> = {}) {
    const butcher = await this.repo.findButcherIdByUser(user.userId);
    if (!butcher) {
      throwApi(403, 'no_butcher_profile', 'ليس لديك ملف ملحمة مسجل');
    }
    const parsed = parseReportsQuery(rawQuery);
    if (!parsed.ok) {
      throwApi(400, 'validation_error', parsed.message);
    }
    const orders = await this.repo.findOrdersForReports(
      butcher.id,
      parsed.query.from,
      parsed.query.to,
    );
    const salesOrders = orders.filter(isCompletedSale);
    const salesTotal = salesOrders.reduce(
      (sum, order) => sum + order.totalPrice,
      0,
    );
    const salesCount = salesOrders.length;
    const avgOrderValue = salesCount > 0 ? salesTotal / salesCount : 0;

    const classification = {
      unpaid: orders.filter((o) => o.paymentStatus === 'unpaid').length,
      cancelled: orders.filter((o) => o.status === 'cancelled').length,
      paidPreparing: orders.filter(
        (o) => o.paymentStatus === 'paid' && o.status === 'preparing',
      ).length,
      paidDelivered: orders.filter(
        (o) => o.paymentStatus === 'paid' && o.status === 'delivered',
      ).length,
      sales: salesCount,
    };

    const productMap: Record<
      string,
      { productId: string; nameAr: string; quantity: number; revenue: number }
    > = {};
    for (const order of salesOrders) {
      const lines =
        order.items.length > 0
          ? order.items
          : [
              {
                productId: order.productId,
                linePrice: order.totalPrice,
                weightKg: 1,
                product: order.product,
              },
            ];
      for (const line of lines) {
        const key = line.productId;
        if (!productMap[key]) {
          productMap[key] = {
            productId: key,
            nameAr: line.product?.nameAr ?? order.product?.nameAr ?? 'منتج',
            quantity: 0,
            revenue: 0,
          };
        }
        productMap[key].quantity += line.weightKg ?? 1;
        productMap[key].revenue += line.linePrice;
      }
    }
    const ranked = Object.values(productMap).sort(
      (a, b) => b.revenue - a.revenue,
    );

    const dailyMap: Record<string, number> = {};
    const weeklyMap: Record<string, number> = {};
    const monthlyMap: Record<string, number> = {};
    for (const order of salesOrders) {
      const day = riyadhCalendarDay(order.createdAt);
      dailyMap[day] = (dailyMap[day] ?? 0) + order.totalPrice;
      const week = isoWeekKeyFromDay(day);
      weeklyMap[week] = (weeklyMap[week] ?? 0) + order.totalPrice;
      const month = day.slice(0, 7);
      monthlyMap[month] = (monthlyMap[month] ?? 0) + order.totalPrice;
    }

    return {
      definition: SALES_DEFINITION,
      period: parsed.query.period,
      from: parsed.query.from,
      to: parsed.query.to,
      salesTotal,
      salesCount,
      avgOrderValue,
      orderCountInPeriod: orders.length,
      classification,
      topProducts: ranked.slice(0, 5),
      bottomProducts: [...ranked].reverse().slice(0, 5),
      daily: Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, total]) => ({ date, total })),
      weekly: Object.entries(weeklyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, total]) => ({ week, total })),
      monthly: Object.entries(monthlyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, total]) => ({ month, total })),
    };
  }

  async createProduct(user: JwtPayload, body: unknown) {
    const butcher = await this.repo.findButcherIdByUser(user.userId);
    if (!butcher) {
      throwApi(403, 'no_butcher_profile', 'ليس لديك ملف ملحمة مسجل');
    }

    const parsed = createProductSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const availableQuantity = resolveProductAvailableQuantity(parsed.data);
    const product = await this.repo.createProduct({
      ...parsed.data,
      availableQuantity,
      category: parsed.data
        .category as Prisma.ButcherProductCreateInput['category'],
      country: parsed.data
        .country as Prisma.ButcherProductCreateInput['country'],
      butcherId: butcher.id,
    });

    logger.info(
      { productId: product.id, butcherId: butcher.id },
      'Butcher product created',
    );
    return product;
  }

  async updateProduct(id: string, user: JwtPayload, body: unknown) {
    if (!id) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const product = await this.repo.findProductWithButcher(id);
    if (!product) throwApi(404, 'not_found', 'المنتج غير موجود');
    if (product.butcher.userId !== user.userId && user.role !== 'ADMIN') {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    const parsed = updateProductSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const updateData = { ...parsed.data } as Prisma.ButcherProductUpdateInput;
    if (
      parsed.data.availableQuantity != null ||
      parsed.data.weightMin != null ||
      parsed.data.weightMax != null
    ) {
      const existing = await this.repo.findProductWithButcher(id);
      if (existing) {
        updateData.availableQuantity = resolveProductAvailableQuantity({
          availableQuantity:
            parsed.data.availableQuantity ?? existing.availableQuantity,
          weightMax: parsed.data.weightMax ?? existing.weightMax,
          weightMin: parsed.data.weightMin ?? existing.weightMin,
        });
      }
    }

    const updated = await this.repo.updateProduct(id, updateData);
    await this.redis.cacheDel(`butcher:${product.butcher.id}`);
    await this.redis.cacheDel('butcher:me');

    logger.info(
      { productId: id, userId: user.userId },
      'Butcher product updated',
    );
    return updated;
  }

  async deleteProduct(id: string, user: JwtPayload) {
    if (!id) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const product = await this.repo.findProductWithButcher(id);
    if (!product) throwApi(404, 'not_found', 'المنتج غير موجود');
    if (product.butcher.userId !== user.userId && user.role !== 'ADMIN') {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    await this.repo.softDeleteProduct(id);
    await this.redis.cacheDel(`butcher:${product.butcher.id}`);
    await this.redis.cacheDel('butcher:me');

    logger.info(
      { productId: id, userId: user.userId },
      'Butcher product deleted',
    );
    return { deleted: true };
  }

  async listOffers(user: JwtPayload) {
    const butcher = await this.repo.findButcherIdByUser(user.userId);
    if (!butcher) throwApi(404, 'not_found', 'الملحمة غير موجودة');
    return this.repo.findActiveOffers(butcher.id);
  }

  async createOffer(user: JwtPayload, body: unknown) {
    const butcher = await this.repo.findButcherIdByUser(user.userId);
    if (!butcher) throwApi(404, 'not_found', 'الملحمة غير موجودة');

    const parsed = createOfferSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const offer = await this.repo.createOffer({
      butcherId: butcher.id,
      ...parsed.data,
      validUntil: new Date(parsed.data.validUntil),
    });

    await this.redis.cacheDel(`butcher:${butcher.id}`);
    await this.redis.cacheDel('butcher:me');

    logger.info(
      { offerId: offer.id, butcherId: butcher.id },
      'Butcher offer created',
    );
    return offer;
  }

  async updateOffer(id: string, user: JwtPayload, body: unknown) {
    if (!id) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const offer = await this.repo.findOwnedOffer(id, user.userId);
    if (!offer) throwApi(404, 'not_found', 'العرض غير موجود');

    const parsed = updateOfferSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.validUntil) {
      data.validUntil = new Date(parsed.data.validUntil);
    }

    const updated = await this.repo.updateOffer(id, data);
    await this.redis.cacheDel(`butcher:${offer.butcherId}`);
    await this.redis.cacheDel('butcher:me');

    logger.info({ offerId: id }, 'Butcher offer updated');
    return updated;
  }

  async deleteOffer(id: string, user: JwtPayload) {
    if (!id) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const offer = await this.repo.findOwnedOffer(id, user.userId);
    if (!offer) throwApi(404, 'not_found', 'العرض غير موجود');

    await this.repo.softDeleteOffer(id);
    await this.redis.cacheDel(`butcher:${offer.butcherId}`);
    await this.redis.cacheDel('butcher:me');

    logger.info({ offerId: id }, 'Butcher offer deleted');
    return { deleted: true };
  }

  async getDashboardSummary(user: JwtPayload) {
    const butcher = await this.repo.findButcherForStats(user.userId);
    if (!butcher) {
      throwApi(403, 'no_butcher_profile', 'ليس لديك ملف ملحمة مسجل');
    }

    const today = startOfTodayRiyadh();
    const [
      statusGroups,
      salesToday,
      deliveredToday,
      cancelledToday,
      recentOrders,
      products,
    ] = await Promise.all([
      this.repo.groupOrderStatusCounts(butcher.id),
      this.repo.sumSalesSince(butcher.id, today),
      this.repo.countOrdersSince(butcher.id, today, 'delivered'),
      this.repo.countOrdersSince(butcher.id, today, 'cancelled'),
      this.repo.findRecentOrdersForButcher(butcher.id, 8),
      this.repo.findProductsInventory(butcher.id),
    ]);

    const counts: Record<OrderStatus, number> = {
      pending: 0,
      confirmed: 0,
      preparing: 0,
      ready: 0,
      delivered: 0,
      cancelled: 0,
    };
    for (const row of statusGroups) {
      counts[row.status] = row._count._all;
    }

    const inventoryLow = [];
    const inventoryOut = [];
    for (const product of products) {
      const kind = classifyProductStock(product);
      const item = {
        id: product.id,
        nameAr: product.nameAr,
        availableQuantity: product.availableQuantity,
        reservedQuantity: product.reservedQuantity,
        sellableQuantity: sellableQuantity(product),
        inStock: product.inStock,
        stock: kind,
      };
      if (kind === 'out') inventoryOut.push(item);
      else if (kind === 'low') inventoryLow.push(item);
    }

    return {
      butcher: {
        id: butcher.id,
        nameAr: butcher.nameAr,
        nameEn: butcher.nameEn,
        isOpen: butcher.isOpen,
      },
      counts: {
        pending: counts.pending,
        confirmed: counts.confirmed,
        preparing: counts.preparing,
        ready: counts.ready,
        delivered: counts.delivered,
        cancelled: counts.cancelled,
        deliveredToday,
        cancelledToday,
      },
      salesToday: salesToday._sum.totalPrice ?? 0,
      ordersToday: salesToday._count._all,
      currency: 'SAR',
      inventory: {
        thresholdKg: LOW_STOCK_DISPLAY_THRESHOLD_KG,
        low: inventoryLow,
        out: inventoryOut,
      },
      recentOrders: recentOrders.map((order) => ({
        ...order,
        allowedNextStatuses: this.orderStateMachine.getAllowedNext(
          order.status as OrderStatus,
        ),
      })),
    };
  }

  async getOrders(user: JwtPayload, rawQuery: Record<string, unknown> = {}) {
    const parsed = parseOrderListQuery(rawQuery);
    if (!parsed.ok) {
      throwApi(400, 'validation_error', parsed.message);
    }

    const butcher = await this.repo.findButcherIdByUser(user.userId);
    const withNext = <T extends { status: OrderStatus | string }>(
      orders: T[],
    ) =>
      orders.map((order) => ({
        ...order,
        allowedNextStatuses: this.orderStateMachine.getAllowedNext(
          order.status as OrderStatus,
        ),
      }));

    if (!parsed.query.paged) {
      if (butcher) {
        return withNext(await this.repo.findOrdersForButcher(butcher.id));
      }
      return withNext(await this.repo.findOrdersForCustomer(user.userId));
    }

    const where = buildOrderListWhere({
      butcherId: butcher?.id,
      customerId: butcher ? undefined : user.userId,
      status: parsed.query.status,
      search: parsed.query.search,
      from: parsed.query.from,
      to: parsed.query.to,
    });
    const skip = (parsed.query.page - 1) * parsed.query.limit;
    const [items, total] = await Promise.all([
      this.repo.findOrdersPage(where, skip, parsed.query.limit, !butcher),
      this.repo.countOrders(where),
    ]);

    return {
      items: withNext(items),
      total,
      page: parsed.query.page,
      limit: parsed.query.limit,
      hasMore: skip + items.length < total,
    };
  }

  async createOrder(user: JwtPayload, body: unknown) {
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const orderInput = parsed.data;
    const { butcherId, deliveryType, deliveryAddress, notes, currency } =
      orderInput;

    const rawLines =
      'items' in orderInput
        ? orderInput.items
        : [
            {
              productId: orderInput.productId,
              cutType: orderInput.cutType,
              weightKg: orderInput.weightKg,
            },
          ];

    const validatedLines = [];
    for (const line of rawLines) {
      const product = await this.repo.findProductForOrder(line.productId);
      validatedLines.push(validateAndPriceOrderLine(product, butcherId, line));
    }

    const totalPrice = sumOrderLinePrices(validatedLines);

    const order = await this.orderLifecycle.createOrder({
      butcherId,
      deliveryType,
      deliveryAddress,
      notes,
      currency,
      totalPrice,
      customerId: user.userId,
      items: validatedLines,
    });

    logger.info(
      {
        orderId: order.id,
        customerId: user.userId,
        itemCount: validatedLines.length,
      },
      'Butcher order placed',
    );
    return order;
  }

  private async validateCheckoutLines(
    user: JwtPayload,
    body: unknown,
  ): Promise<{
    butcherId: string;
    deliveryType: string;
    deliveryAddress?: string | null;
    notes?: string | null;
    currency: string;
    totalPrice: number;
    validatedLines: ReturnType<typeof validateAndPriceOrderLine>[];
    method: 'mada' | 'visa' | 'mastercard' | 'apple_pay' | 'stc_pay';
  }> {
    const raw = (body ?? {}) as Record<string, unknown>;
    const methodRaw = raw.method;
    const method =
      methodRaw === 'visa' ||
      methodRaw === 'mastercard' ||
      methodRaw === 'apple_pay' ||
      methodRaw === 'stc_pay' ||
      methodRaw === 'mada'
        ? methodRaw
        : 'mada';
    const { method: _ignored, ...orderBody } = raw;
    const parsed = createOrderSchema.safeParse(orderBody);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const orderInput = parsed.data;
    const { butcherId, deliveryType, deliveryAddress, notes, currency } =
      orderInput;
    const rawLines =
      'items' in orderInput
        ? orderInput.items
        : [
            {
              productId: orderInput.productId,
              cutType: orderInput.cutType,
              weightKg: orderInput.weightKg,
            },
          ];

    const validatedLines = [];
    for (const line of rawLines) {
      const product = await this.repo.findProductForOrder(line.productId);
      validatedLines.push(validateAndPriceOrderLine(product, butcherId, line));
    }

    return {
      butcherId,
      deliveryType,
      deliveryAddress,
      notes,
      currency,
      totalPrice: sumOrderLinePrices(validatedLines),
      validatedLines,
      method,
    };
  }

  async createCheckout(user: JwtPayload, body: unknown) {
    if (!this.payments) {
      throwApi(500, 'payments_unavailable', 'خدمة الدفع غير متاحة');
    }

    const input = await this.validateCheckoutLines(user, body);
    const inFlightKey = `${user.userId}:${input.butcherId}`;
    const running = this.inFlightCheckouts.get(inFlightKey);
    if (running) {
      return running as Promise<{
        checkoutId: string;
        paymentId: string;
        checkoutUrl: string;
        status: string;
        alreadyPaid: boolean;
        devMode: boolean;
        butcherId: string;
        totalPrice: number;
        currency: string;
        expiresAt: Date;
        orderId: string | null;
        orderNumber: string | null;
      }>;
    }

    const promise = this.startCheckoutPayment(user, input).finally(() => {
      this.inFlightCheckouts.delete(inFlightKey);
    });
    this.inFlightCheckouts.set(inFlightKey, promise);
    return promise;
  }

  private async startCheckoutPayment(
    user: JwtPayload,
    input: Awaited<ReturnType<ButchersService['validateCheckoutLines']>>,
  ) {
    const payments = this.payments;
    if (!payments) {
      throwApi(500, 'payments_unavailable', 'خدمة الدفع غير متاحة');
    }

    const { checkout, reused } =
      await this.orderLifecycle.createCheckoutAttempt({
        butcherId: input.butcherId,
        deliveryType: input.deliveryType,
        deliveryAddress: input.deliveryAddress,
        notes: input.notes,
        currency: input.currency,
        totalPrice: input.totalPrice,
        customerId: user.userId,
        items: input.validatedLines,
      });

    try {
      const payment = await payments.initiate(user, {
        amount: input.totalPrice,
        currency: input.currency || 'SAR',
        method: input.method,
        type: 'butcher_checkout',
        referenceId: checkout.id,
        description: `Butcher checkout ${checkout.id}`,
        descriptionAr: 'دفع طلب ملحمة',
      });

      await this.orderLifecycle.linkCheckoutPayment(
        checkout.id,
        payment.paymentId,
      );

      const alreadyPaid =
        'alreadyPaid' in payment && payment.alreadyPaid === true;
      const paidOrder =
        alreadyPaid || payment.status === 'paid'
          ? await this.orderLifecycle.findOrderByPaymentId(payment.paymentId)
          : null;

      logger.info(
        {
          checkoutId: checkout.id,
          paymentId: payment.paymentId,
          customerId: user.userId,
          reused,
          alreadyPaid,
          orderId: paidOrder?.id ?? null,
        },
        'Butcher checkout payment attempt started',
      );

      return {
        checkoutId: checkout.id,
        paymentId: payment.paymentId,
        checkoutUrl: payment.checkoutUrl,
        status: payment.status,
        alreadyPaid,
        devMode: payment.devMode,
        butcherId: input.butcherId,
        totalPrice: input.totalPrice,
        currency: input.currency,
        expiresAt: checkout.expiresAt,
        orderId: paidOrder?.id ?? null,
        orderNumber: paidOrder?.orderNumber ?? null,
      };
    } catch (err) {
      if (!reused) {
        await this.orderLifecycle
          .abandonCheckout(user.userId, checkout.id)
          .catch(() => undefined);
      }
      throw err;
    }
  }

  async abandonCheckout(user: JwtPayload, checkoutId: string) {
    if (!checkoutId) throwApi(400, 'invalid_id', 'معرّف غير صالح');
    return this.orderLifecycle.abandonCheckout(user.userId, checkoutId);
  }

  async updateOrder(id: string, user: JwtPayload, body: unknown) {
    if (!id) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const parsed = updateOrderSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const statusInput = parsed.data;

    const order = await this.repo.findOrderWithButcher(id);
    if (!order) throwApi(404, 'not_found', 'الطلب غير موجود');

    const isCustomer = order.customerId === user.userId;
    const isButcher = order.butcher.userId === user.userId;
    const isAdmin = user.role === 'ADMIN';

    if (!isCustomer && !isButcher && !isAdmin) {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    if (
      isCustomer &&
      !isButcher &&
      !isAdmin &&
      statusInput.status !== 'cancelled'
    ) {
      throwApi(
        403,
        'forbidden_status_change',
        'لا يمكنك تغيير حالة الطلب لغير ملغى',
      );
    }

    if (
      isCustomer &&
      !isButcher &&
      !isAdmin &&
      statusInput.status === 'cancelled' &&
      order.paymentStatus === 'paid'
    ) {
      throwApi(
        403,
        'forbidden_status_change',
        'لا يمكن إلغاء الطلب بعد إتمام الدفع',
      );
    }

    const updated = await this.orderLifecycle.transitionOrder({
      orderId: id,
      actorId: user.userId,
      nextStatus: statusInput.status as OrderStatus,
      cancellationReason:
        statusInput.status === 'cancelled'
          ? (statusInput.cancellationReason ?? 'Order cancelled by actor')
          : null,
    });

    logger.info(
      { orderId: id, status: statusInput.status },
      'Butcher order status updated',
    );
    return updated;
  }

  async getOrderById(id: string, user: JwtPayload) {
    if (!id) throwApi(400, 'invalid_id', 'معرّف غير صالح');
    const order = await this.repo.findOrderById(id);
    if (!order) throwApi(404, 'not_found', 'الطلب غير موجود');

    const isCustomer = order.customerId === user.userId;
    const isButcher = order.butcher.userId === user.userId;
    const isAdmin = user.role === 'ADMIN' || user.role === 'MODERATOR';
    if (!isCustomer && !isButcher && !isAdmin) {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    const audits =
      isButcher || isAdmin ? await this.repo.findOrderAudits(id) : undefined;
    return {
      ...order,
      allowedNextStatuses: this.orderStateMachine.getAllowedNext(
        order.status as OrderStatus,
      ),
      ...(audits ? { audits } : {}),
    };
  }

  async getActiveStories() {
    const cacheKey = 'butchers:stories:active';
    const cached = await this.redis.cacheGet(cacheKey);
    if (cached) return cached;

    try {
      const activeStories = await this.repo.findActiveStories();
      await this.redis.cacheSet(cacheKey, activeStories, 30);
      return activeStories;
    } catch (err) {
      logger.error({ err }, 'Fetch active butcher stories error');
      throwApi(500, 'server_error', 'خطأ في الخادم');
    }
  }

  async createStory(user: JwtPayload, body: unknown) {
    const parsed = createStorySchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const storyInput = parsed.data;

    try {
      const butcher = await this.repo.findButcherIdByUser(user.userId);
      if (!butcher) {
        throwApi(
          403,
          'butcher_profile_required',
          'يجب أن تمتلك ملف ملحمة نشط لنشر القصص',
        );
      }

      const expiresAt = storyExpiresAt();
      const duration = clampStoryDuration(
        storyInput.duration ?? STORY_IMAGE_DURATION_SEC,
      );

      const story = await this.repo.createStory({
        ...storyInput,
        duration,
        butcherId: butcher.id,
        expiresAt,
      });

      await this.redis.cacheDel('butchers:stories:active');
      logger.info(
        { storyId: story.id, butcherId: butcher.id },
        'Butcher story created successfully',
      );
      return story;
    } catch (err) {
      if (err instanceof ApiException) throw err;
      logger.error({ err }, 'Create butcher story error');
      throwApi(500, 'server_error', 'خطأ في الخادم');
    }
  }

  async deleteStory(id: string, user: JwtPayload) {
    if (!id) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const story = await this.repo.findStoryWithButcher(id);
    if (!story) throwApi(404, 'not_found', 'القصة غير موجودة');
    if (story.butcher.userId !== user.userId && user.role !== 'ADMIN') {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    await this.repo.softDeleteStory(id);
    await this.redis.cacheDel('butchers:stories:active');

    logger.info({ storyId: id, userId: user.userId }, 'Butcher story deleted');
    return { deleted: true };
  }

  async getReviews(butcherId: string) {
    if (!butcherId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const butcher = await this.repo.findButcherOwner(butcherId);
    if (!butcher) throwApi(404, 'not_found', 'الملحمة غير موجودة');

    const [reviews, distribution] = await Promise.all([
      this.repo.findReviews(butcherId),
      this.repo.aggregateReviewDistribution(butcherId),
    ]);

    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of distribution) {
      dist[row.rating] = row._count.rating;
    }

    return { reviews, distribution: dist };
  }

  async addFavorite(butcherId: string, user: JwtPayload) {
    const butcher = await this.repo.findButcherForReview(butcherId);
    if (!butcher) throwApi(404, 'not_found', 'الملحمة غير موجودة');
    if (butcher.userId === user.userId) {
      throwApi(400, 'invalid_action', 'لا يمكنك إضافة ملحمتك للمفضلة');
    }

    try {
      await this.repo.addFavorite(butcherId, user.userId);
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        return { favorited: true };
      }
      throw err;
    }

    await this.ranking.onFavoriteChanged(butcherId);
    await this.redis.cacheDelPattern('butchers:v4:*');
    return { favorited: true };
  }

  async removeFavorite(butcherId: string, user: JwtPayload) {
    const butcher = await this.repo.findButcherForReview(butcherId);
    if (!butcher) throwApi(404, 'not_found', 'الملحمة غير موجودة');

    try {
      await this.repo.removeFavorite(butcherId, user.userId);
    } catch {
      return { favorited: false };
    }

    await this.ranking.onFavoriteChanged(butcherId);
    await this.redis.cacheDelPattern('butchers:v4:*');
    return { favorited: false };
  }

  async getFavoriteStatus(butcherId: string, user: JwtPayload) {
    const row = await this.repo.isFavorited(butcherId, user.userId);
    return { favorited: !!row };
  }

  async submitReview(butcherId: string, user: JwtPayload, body: unknown) {
    const butcher = await this.repo.findButcherForReview(butcherId);
    if (!butcher) throwApi(404, 'not_found', 'الملحمة غير موجودة');

    if (butcher.userId === user.userId) {
      throwApi(400, 'invalid_action', 'لا يمكنك تقييم ملحمتك الخاصة');
    }

    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }

    const deliveredOrder = await this.repo.findDeliveredOrderForReview(
      butcherId,
      user.userId,
    );
    if (!deliveredOrder) {
      throwApi(
        403,
        'order_required',
        'يمكنك التقييم فقط بعد استلام طلب مكتمل من هذه الملحمة',
      );
    }

    const existing = await this.repo.findReviewByButcherAndUser(
      butcherId,
      user.userId,
    );
    if (existing) {
      const editDeadline = new Date(existing.createdAt);
      editDeadline.setDate(editDeadline.getDate() + REVIEW_EDIT_WINDOW_DAYS);
      if (new Date() > editDeadline) {
        throwApi(403, 'edit_window_closed', 'انتهت مدة تعديل التقييم');
      }
    }

    const reviewInput = parsed.data;

    try {
      const review = await this.repo.upsertReview({
        butcherId,
        reviewerId: user.userId,
        rating: reviewInput.rating,
        comment: reviewInput.comment,
      });

      const agg = await this.repo.aggregateReviews(butcherId);
      await this.repo.updateButcherRating(
        butcherId,
        agg._avg.rating ?? 0,
        agg._count.rating,
      );

      await this.ranking.onReviewChanged(butcherId);
      await this.redis.cacheDel(`butcher:${butcherId}`);
      await this.redis.cacheDelPattern('butchers:v4:*');

      logger.info(
        { butcherId, reviewerId: user.userId },
        'Butcher review submitted',
      );
      return review;
    } catch (err: unknown) {
      logger.error({ err }, 'Submit review error');
      throwApi(500, 'server_error', 'خطأ في الخادم');
    }
  }
}
