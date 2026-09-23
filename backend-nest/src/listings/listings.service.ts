import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { shouldCreateFee } from '../lib/commissions';
import {
  calculateListingFeeAmount,
  LISTING_COVENANT_VERSION,
} from './listing-fee';
import { ApiException, throwApi } from '../common/exceptions/api.exception';
import {
  LISTING_DAILY_LIMIT_MESSAGE_AR,
  LISTING_EDIT_LIMIT_MESSAGE_AR,
  LISTING_OWNER_EDIT_LIMIT,
} from './listing-policy';
import { LoggerService } from '../common/services/logger.service';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import { FeeCheckQueueService } from '../queue/services/fee-check-queue.service';
import { AppNotificationsService } from '../queue/services/app-notifications.service';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  ApplyPlanPromoteDto,
  CreateListingDto,
  CreateListingCommentDto,
  DeleteListingDto,
  ListListingsQueryDto,
  UpdateListingDto,
} from './dto/listings.dto';
import { ListingsRepository } from './repositories/listings.repository';
import { UsersRepository } from '../users/repositories/users.repository';
import { ListingPromotionService } from './promotion/listing-promotion.service';
import {
  interleavePromotedListings,
  promotionSearchScore,
} from './promotion/promotion-ranking.util';
import {
  extractListingVideoUrl,
  isEphemeralDiskUploadUrl,
  sanitizeListingMedia,
} from '../shared/lib/media-url';
import { SubscriptionEntitlementService } from '../subscriptions/services/subscription-entitlement.service';
import { PlanResolverService } from '../plans/plan-resolver.service';
import { PlanPermissionService } from '../plans/plan-permission.service';
import { notDeleted } from '../common/utils/soft-delete.util';
import {
  categoryRequiresWeight,
  resolveLegacyListingCategory,
} from './listing-categories';
import { MarketCategoriesService } from '../market-categories/services/market-categories.service';
import { PaidServicesService } from '../settings/paid-services.service';
import {
  searchTextVariants,
  tokenizeSearchQuery,
} from '../search/lib/arabic-search.util';

const PAGE_SIZE = 20;

const LISTING_PAGE_ORDER: Prisma.ListingOrderByWithRelationInput[] = [
  { pinned: 'desc' },
  { featured: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' },
];

function listingSearchTokenConditions(
  tokens: string[],
): Prisma.ListingWhereInput[] {
  return tokens.map((token) => {
    const variants = searchTextVariants(token);
    const ors: Prisma.ListingWhereInput[] = [];
    for (const v of variants) {
      ors.push(
        { arabicTitle: { contains: v } },
        { title: { contains: v, mode: 'insensitive' } },
        { arabicLocation: { contains: v } },
        { location: { contains: v, mode: 'insensitive' } },
        { breed: { contains: v, mode: 'insensitive' } },
        { arabicDescription: { contains: v } },
        { description: { contains: v, mode: 'insensitive' } },
      );
    }
    return { OR: ors };
  });
}

@Injectable()
export class ListingsService {
  constructor(
    private readonly repo: ListingsRepository,
    private readonly usersRepo: UsersRepository,
    private readonly cache: RedisCacheService,
    private readonly logger: LoggerService,
    private readonly feeCheckQueue: FeeCheckQueueService,
    private readonly notifications: AppNotificationsService,
    private readonly entitlements: SubscriptionEntitlementService,
    private readonly planResolver: PlanResolverService,
    private readonly planPermissions: PlanPermissionService,
    private readonly promotions: ListingPromotionService,
    private readonly marketCategories: MarketCategoriesService,
    private readonly paidServices: PaidServicesService,
  ) {}

  private sellerPriorityBoost(
    seller?: {
      subscription?: { planId?: string; planAudience?: 'USER' | 'BUTCHER' };
      verified?: boolean;
    } | null,
  ): number {
    const planId = seller?.subscription?.planId ?? 'free';
    const audience = seller?.subscription?.planAudience ?? 'USER';
    const resolved = this.planResolver.resolveSync(planId, audience);
    if (resolved) {
      return this.planPermissions.priorityBoost(resolved.permissions);
    }
    return seller?.verified ? 1 : 0;
  }

  private assertWeightForCategory(
    category: string,
    weightKg?: number | null,
    parentRequiresWeight?: boolean | null,
  ) {
    if (categoryRequiresWeight(category, parentRequiresWeight)) {
      if (weightKg == null || weightKg <= 0) {
        throwApi(
          400,
          'weight_required',
          'الوزن مطلوب للذبائح ويجب أن يكون بالكيلوغرام',
        );
      }
      return;
    }
    if (weightKg != null && weightKg <= 0) {
      throwApi(400, 'invalid_weight', 'قيمة الوزن غير صالحة');
    }
  }

  private assertDurableListingMedia(urls: Array<string | null | undefined>) {
    if (process.env.NODE_ENV !== 'production') return;
    const ephemeral = urls.filter(
      (url) => typeof url === 'string' && isEphemeralDiskUploadUrl(url),
    );
    if (ephemeral.length > 0) {
      throwApi(
        400,
        'ephemeral_media',
        'مسارات /uploads غير مدعومة في الإنتاج. ارفع الملفات عبر Cloudinary.',
      );
    }
  }

  async list(query: ListListingsQueryDto, viewerId?: string) {
    this.promotions.expireStalePromotions().catch(() => {});

    const {
      cursor,
      category,
      categoryId,
      subcategoryId,
      country,
      search,
      featured,
      sellerId,
      minPrice,
      maxPrice,
      suggested,
      promoted,
    } = query;

    const cacheKey =
      search ||
      minPrice != null ||
      maxPrice != null ||
      suggested ||
      promoted ||
      categoryId ||
      subcategoryId
        ? null
        : `listings:v3:${JSON.stringify({ cursor, category, country, featured, sellerId })}`;

    if (cacheKey) {
      const cached = await this.cache.get<{
        listings: unknown[];
        nextCursor: string | null;
        hasMore: boolean;
      }>(cacheKey);
      if (cached) {
        return {
          ...cached,
          listings: cached.listings.map((item) =>
            sanitizeListingMedia((item ?? {}) as object),
          ),
        };
      }
    }

    const where: Prisma.ListingWhereInput = { status: 'active', ...notDeleted };
    if (category) where.category = category;
    if (country) where.country = country;
    if (featured) where.featured = true;
    if (suggested || promoted) where.promoted = true;
    if (sellerId) where.sellerId = sellerId;

    const andFilters: Prisma.ListingWhereInput[] = [];
    if (subcategoryId) {
      andFilters.push({ subcategoryId });
    } else if (categoryId) {
      andFilters.push({
        OR: [{ categoryId }, { marketSubcategory: { parentId: categoryId } }],
      });
    }

    if (viewerId) {
      const blockedIds =
        await this.usersRepo.findBlockedRelationshipIds(viewerId);
      if (blockedIds.length > 0) {
        if (sellerId && blockedIds.includes(sellerId)) {
          return { listings: [], nextCursor: null, hasMore: false };
        }
        where.sellerId = sellerId ? sellerId : { notIn: blockedIds };
      }
    }

    if (search && search.trim().length >= 2) {
      const tokens = tokenizeSearchQuery(search);
      if (tokens.length === 0) {
        return { listings: [], nextCursor: null, hasMore: false };
      }
      andFilters.push({ AND: listingSearchTokenConditions(tokens) });
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    if (minPrice != null || maxPrice != null) {
      where.price = {};
      if (minPrice != null) where.price.gte = minPrice;
      if (maxPrice != null) where.price.lte = maxPrice;
    }

    const listings = await this.repo.findMany({
      where,
      take: PAGE_SIZE + 1,
      cursor,
      orderBy: LISTING_PAGE_ORDER,
    });

    const hasMore = listings.length > PAGE_SIZE;
    const items = hasMore ? listings.slice(0, PAGE_SIZE) : listings;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

    const sorted = [...items].sort((a, b) => {
      const pinnedDiff = Number(b.pinned) - Number(a.pinned);
      if (pinnedDiff !== 0) return pinnedDiff;
      const featuredDiff = Number(b.featured) - Number(a.featured);
      if (featuredDiff !== 0) return featuredDiff;
      if (search && search.length >= 2) {
        const promoDiff =
          promotionSearchScore(b.promotionWeight) -
          promotionSearchScore(a.promotionWeight);
        if (promoDiff !== 0) return promoDiff;
      }
      const priorityDiff =
        this.sellerPriorityBoost(
          b.seller as {
            subscription?: {
              planId?: string;
              planAudience?: 'USER' | 'BUTCHER';
            };
            verified?: boolean;
          },
        ) -
        this.sellerPriorityBoost(
          a.seller as {
            subscription?: {
              planId?: string;
              planAudience?: 'USER' | 'BUTCHER';
            };
            verified?: boolean;
          },
        );
      if (priorityDiff !== 0) return priorityDiff;
      const weightDiff = (b.promotionWeight ?? 0) - (a.promotionWeight ?? 0);
      if (weightDiff !== 0) return weightDiff;
      const createdDiff =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (createdDiff !== 0) return createdDiff;
      return String(b.id).localeCompare(String(a.id));
    });

    const ranked =
      suggested || promoted ? sorted : interleavePromotedListings(sorted);
    const publicListings = ranked.map((item) => sanitizeListingMedia(item));

    const result = { listings: publicListings, nextCursor, hasMore };

    if (cacheKey) await this.cache.set(cacheKey, result, 90);
    return result;
  }

  async getById(id: string) {
    if (!id) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    this.promotions.expireStalePromotions().catch(() => {});

    const cacheKey = `listing:${id}`;
    const cached = await this.cache.get<{ promoted?: boolean }>(cacheKey);
    if (cached) {
      this.repo.incrementViews(id).catch(() => {});
      if (cached.promoted) {
        void this.promotions.trackPromotionEvent(id, 'view');
      }
      return sanitizeListingMedia(cached);
    }

    const listing = await this.repo.findById(id);
    if (!listing) throwApi(404, 'not_found', 'الإعلان غير موجود');

    this.repo.incrementViews(id).catch(() => {});
    if (listing.promoted) {
      void this.promotions.trackPromotionEvent(id, 'view');
    }
    await this.cache.set(cacheKey, listing, 300);
    return sanitizeListingMedia(listing);
  }

  async create(user: JwtPayload, dto: CreateListingDto) {
    const quantity = dto.quantity ?? 1;
    const currency = dto.currency ?? 'SAR';
    const featured = dto.featured ?? false;
    const pinned = dto.pinned ?? false;
    this.assertDurableListingMedia([
      ...(dto.images ?? []),
      dto.thumbnailUrl,
      dto.videoUrl,
    ]);

    let legacyCategory = dto.category;
    let categoryId = dto.categoryId ?? null;
    let subcategoryId = dto.subcategoryId ?? null;
    let parentRequiresWeight: boolean | null = null;

    if (subcategoryId) {
      const sub =
        await this.marketCategories.findSubcategoryWithParent(subcategoryId);
      if (!sub || !sub.parent) {
        throwApi(400, 'invalid_subcategory', 'التصنيف الفرعي غير صالح');
      }
      categoryId = sub.parent.id;
      subcategoryId = sub.id;
      legacyCategory = resolveLegacyListingCategory(sub);
      parentRequiresWeight =
        sub.parent.requiresWeight || sub.requiresWeight || null;
    } else if (categoryId) {
      const parent = await this.marketCategories.findByIdRaw(categoryId);
      if (!parent || parent.parentId) {
        throwApi(400, 'invalid_category', 'التصنيف الرئيسي غير صالح');
      }
      parentRequiresWeight = parent.requiresWeight;
      if (!legacyCategory) {
        legacyCategory = resolveLegacyListingCategory({
          slug: parent.slug,
          legacyCategory: parent.legacyCategory,
        });
      }
    }

    if (!legacyCategory) {
      throwApi(
        400,
        'category_required',
        'يجب تحديد التصنيف أو التصنيف الرئيسي والفرعي',
      );
    }

    const effectivePlanSlug = await this.entitlements.assertCanCreateListing(
      user.userId,
      { images: dto.images, featured, pinned },
      { role: user.role },
    );

    const flags = await this.paidServices.getFlags();
    const listingFeesEnabled = flags.listingFeesEnabled === true;
    if (listingFeesEnabled && dto.acceptedCovenant !== true) {
      throwApi(
        403,
        'covenant_required',
        'يجب الموافقة على تعهد عمولة الإعلان قبل النشر',
      );
    }

    const createFee = shouldCreateFee(listingFeesEnabled);
    const commission = createFee ? calculateListingFeeAmount(dto.price) : 0;

    this.assertWeightForCategory(
      legacyCategory,
      dto.weightKg,
      parentRequiresWeight,
    );

    try {
      const listing = await this.repo.createListingWithFee({
        userId: user.userId,
        featured,
        pinned,
        createFee,
        data: {
          title: dto.title,
          arabicTitle: dto.arabicTitle,
          description: dto.description,
          arabicDescription: dto.arabicDescription,
          price: dto.price,
          currency,
          category: legacyCategory,
          categoryId: categoryId ?? undefined,
          subcategoryId: subcategoryId ?? undefined,
          breed: dto.breed,
          age: dto.age,
          quantity,
          location: dto.location,
          arabicLocation: dto.arabicLocation,
          country: dto.country,
          contactPhone: dto.contactPhone,
          weightKg: dto.weightKg ?? null,
          images: dto.images,
          videoUrl: extractListingVideoUrl(dto.videoUrl, dto.images),
          thumbnailUrl: dto.thumbnailUrl ?? null,
          videoDuration: dto.videoDuration ?? null,
          videoWidth: dto.videoWidth ?? null,
          videoHeight: dto.videoHeight ?? null,
          videoFileSize: dto.videoFileSize ?? null,
          featured,
          pinned,
          covenantAccepted: listingFeesEnabled,
          covenantAcceptedAt: listingFeesEnabled ? new Date() : undefined,
          covenantVersion: listingFeesEnabled
            ? dto.covenantVersion?.trim() || LISTING_COVENANT_VERSION
            : undefined,
        },
        commission,
        dueDate: null,
        category: legacyCategory,
        quantity,
        price: dto.price,
      });

      await this.notifications.notifyUser({
        userId: user.userId,
        type: 'system',
        titleAr: '✅ تم نشر إعلانك',
        bodyAr: `إعلانك "${dto.arabicTitle}" منشور بنجاح.`,
        data: { listingId: listing.id },
      });

      await this.cache.delPattern('listings:v2:*');

      this.logger.info(
        {
          listingId: listing.id,
          userId: user.userId,
          commission,
          plan: effectivePlanSlug,
        },
        'Listing created',
      );
      return sanitizeListingMedia(listing);
    } catch (err: unknown) {
      if (err instanceof ApiException) throw err;
      const e = err as { code?: string; limit?: number; message?: string };
      if (
        e.code === 'listing_limit' ||
        e.code === 'featured_limit' ||
        e.code === 'pinned_limit'
      ) {
        throwApi(
          403,
          e.code,
          e.code === 'featured_limit'
            ? `وصلت للحد الأقصى للإعلانات المميزة (${e.limit}).`
            : e.code === 'pinned_limit'
              ? `وصلت للحد الأقصى للإعلانات المثبتة (${e.limit}).`
              : LISTING_DAILY_LIMIT_MESSAGE_AR,
        );
      }
      this.logger.error({ err }, 'Create listing error');
      throwApi(500, 'server_error', 'خطأ في الخادم');
    }
  }

  async update(user: JwtPayload, id: string, dto: UpdateListingDto) {
    const listing = await this.repo.findOwnerMeta(id);
    if (!listing) throwApi(404, 'not_found', 'الإعلان غير موجود');
    if (listing.origin === 'ADMIN_MANAGED') {
      throwApi(403, 'forbidden', 'يُعدَّل هذا الإعلان من لوحة الإدارة');
    }
    if (listing.sellerId !== user.userId && user.role !== 'ADMIN') {
      throwApi(403, 'forbidden', 'غير مسموح');
    }
    if (
      user.role !== 'ADMIN' &&
      (listing.editCount ?? 0) >= LISTING_OWNER_EDIT_LIMIT
    ) {
      throwApi(403, 'listing_edit_limit', LISTING_EDIT_LIMIT_MESSAGE_AR);
    }

    this.assertDurableListingMedia([
      ...(dto.images ?? []),
      dto.thumbnailUrl,
      dto.videoUrl,
    ]);

    let category = dto.category ?? listing.category;
    let categoryId =
      dto.categoryId !== undefined ? dto.categoryId : listing.categoryId;
    let subcategoryId =
      dto.subcategoryId !== undefined
        ? dto.subcategoryId
        : listing.subcategoryId;
    let parentRequiresWeight = listing.marketCategory?.requiresWeight ?? null;

    if (dto.subcategoryId) {
      const sub = await this.marketCategories.findSubcategoryWithParent(
        dto.subcategoryId,
      );
      if (!sub || !sub.parent) {
        throwApi(400, 'invalid_subcategory', 'التصنيف الفرعي غير صالح');
      }
      categoryId = sub.parent.id;
      subcategoryId = sub.id;
      category = resolveLegacyListingCategory(sub);
      parentRequiresWeight =
        sub.parent.requiresWeight || sub.requiresWeight || null;
    } else if (dto.categoryId) {
      const parent = await this.marketCategories.findByIdRaw(dto.categoryId);
      if (!parent || parent.parentId) {
        throwApi(400, 'invalid_category', 'التصنيف الرئيسي غير صالح');
      }
      categoryId = parent.id;
      parentRequiresWeight = parent.requiresWeight;
      if (!dto.category) {
        category = resolveLegacyListingCategory({
          slug: parent.slug,
          legacyCategory: parent.legacyCategory,
        });
      }
    }

    const weightKg =
      dto.weightKg !== undefined
        ? dto.weightKg
        : (listing.weightKg ?? undefined);
    this.assertWeightForCategory(category, weightKg, parentRequiresWeight);

    const updateData: Prisma.ListingUpdateInput = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.arabicTitle !== undefined) updateData.arabicTitle = dto.arabicTitle;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.arabicDescription !== undefined) {
      updateData.arabicDescription = dto.arabicDescription;
    }
    if (dto.price !== undefined) updateData.price = dto.price;
    if (dto.images !== undefined) updateData.images = dto.images;
    if (dto.videoUrl !== undefined) {
      updateData.videoUrl = extractListingVideoUrl(dto.videoUrl, dto.images);
    } else if (dto.images !== undefined) {
      updateData.videoUrl = extractListingVideoUrl(
        listing.videoUrl,
        dto.images,
      );
    }
    if (dto.thumbnailUrl !== undefined) {
      updateData.thumbnailUrl = dto.thumbnailUrl;
    }
    if (user.role !== 'ADMIN') {
      updateData.editCount = { increment: 1 };
    }
    if (dto.breed !== undefined) updateData.breed = dto.breed;
    if (dto.age !== undefined) updateData.age = dto.age;
    if (dto.location !== undefined) updateData.location = dto.location;
    if (dto.arabicLocation !== undefined)
      updateData.arabicLocation = dto.arabicLocation;
    if (dto.contactPhone !== undefined)
      updateData.contactPhone = dto.contactPhone;
    if (dto.category !== undefined || dto.subcategoryId || dto.categoryId) {
      updateData.category = category;
    }
    if (dto.categoryId !== undefined || dto.subcategoryId) {
      updateData.marketCategory = categoryId
        ? { connect: { id: categoryId } }
        : { disconnect: true };
    }
    if (dto.subcategoryId !== undefined) {
      updateData.marketSubcategory = subcategoryId
        ? { connect: { id: subcategoryId } }
        : { disconnect: true };
    }
    if (dto.weightKg !== undefined) {
      updateData.weightKg = dto.weightKg;
    }

    const updated = await this.repo.update(id, updateData);
    await this.cache.del(`listing:${id}`);
    await this.cache.delPattern('listings:v2:*');
    return sanitizeListingMedia(updated);
  }

  async applyPlanPromotion(
    user: JwtPayload,
    id: string,
    dto: ApplyPlanPromoteDto,
  ) {
    const listing = await this.repo.findOwnerMeta(id);
    if (!listing) throwApi(404, 'not_found', 'الإعلان غير موجود');
    if (listing.origin === 'ADMIN_MANAGED') {
      throwApi(403, 'forbidden', 'يُعدَّل هذا الإعلان من لوحة الإدارة');
    }
    if (listing.sellerId !== user.userId && user.role !== 'ADMIN') {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    const wantsFeatured = Boolean(dto.featured) && !listing.featured;
    const wantsPinned = Boolean(dto.pinned) && !listing.pinned;

    const flags = await this.paidServices.getFlags();
    if (wantsFeatured && !flags.featureEnabled) {
      throwApi(403, 'service_disabled', 'خدمة تمييز الإعلان غير مفعّلة حالياً');
    }
    if (wantsPinned && !flags.pinEnabled) {
      throwApi(403, 'service_disabled', 'خدمة تثبيت الإعلان غير مفعّلة حالياً');
    }

    if (!wantsFeatured && !wantsPinned) {
      throwApi(
        400,
        'already_promoted',
        'الإعلان مُفعَّل بالفعل أو لم تُحدَّد ترقية جديدة',
      );
    }

    await this.entitlements.assertCanApplyListingPromotion(user.userId, {
      featured: wantsFeatured,
      pinned: wantsPinned,
    });

    try {
      const updated = await this.repo.applyPlanPromotion({
        userId: user.userId,
        listingId: id,
        setFeatured: wantsFeatured,
        setPinned: wantsPinned,
      });

      await this.cache.del(`listing:${id}`);
      await this.cache.delPattern('listings:v2:*');

      this.logger.info(
        {
          listingId: id,
          userId: user.userId,
          featured: wantsFeatured,
          pinned: wantsPinned,
        },
        'Listing plan promotion applied',
      );
      return sanitizeListingMedia(updated);
    } catch (err: unknown) {
      const e = err as { code?: string; limit?: number };
      if (e.code === 'featured_limit' || e.code === 'pinned_limit') {
        throwApi(
          403,
          e.code,
          e.code === 'featured_limit'
            ? `وصلت للحد الأقصى للإعلانات المميزة (${e.limit}).`
            : `وصلت للحد الأقصى للإعلانات المثبتة (${e.limit}).`,
        );
      }
      throw err;
    }
  }

  async remove(user: JwtPayload, id: string, dto: DeleteListingDto) {
    const listing = await this.repo.findSellerId(id);
    if (!listing) throwApi(404, 'not_found', 'الإعلان غير موجود');
    if (listing.origin === 'ADMIN_MANAGED') {
      throwApi(403, 'forbidden', 'يُعدَّل هذا الإعلان من لوحة الإدارة');
    }
    if (listing.sellerId !== user.userId && user.role !== 'ADMIN') {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    const reason = dto.reason?.trim();
    if (typeof dto.sold !== 'boolean' || !reason) {
      throwApi(
        400,
        'validation_error',
        'يجب تحديد ما إذا تم البيع وذكر السبب قبل حذف الإعلان',
      );
    }

    const now = new Date();
    await this.repo.softDelete(id, {
      sellerDeclaredSold: dto.sold,
      sellerDeclaredSoldAt: dto.sold ? now : null,
      deleteReason: reason,
    });
    await this.cache.del(`listing:${id}`);
    await this.cache.delPattern('listings:v2:*');

    this.logger.info(
      {
        listingId: id,
        userId: user.userId,
        sellerDeclaredSold: dto.sold,
      },
      'Listing deleted',
    );
    return { deleted: true, sellerDeclaredSold: dto.sold };
  }

  async listComments(listingId: string) {
    if (!listingId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const listing = await this.repo.findActiveListingMeta(listingId);
    if (!listing) throwApi(404, 'not_found', 'الإعلان غير موجود');

    const comments = await this.repo.findComments(listingId);
    return { comments };
  }

  async createComment(
    user: JwtPayload,
    listingId: string,
    dto: CreateListingCommentDto,
  ) {
    if (!listingId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const listing = await this.repo.findActiveListingMeta(listingId);
    if (!listing) throwApi(404, 'not_found', 'الإعلان غير موجود');

    if (listing.sellerId && listing.sellerId !== user.userId) {
      const owner = await this.usersRepo.findUserCommentsAudience(
        listing.sellerId,
      );
      if (owner?.commentsAudience === 'followers') {
        const follows = await this.usersRepo.findFollow(
          user.userId,
          listing.sellerId,
        );
        if (!follows) {
          throwApi(
            403,
            'comments_restricted',
            'صاحب الإعلان يقبل التعليقات من المتابعين فقط',
          );
        }
      }
    }

    const comment = await this.repo.createComment(
      listingId,
      user.userId,
      dto.content,
    );

    if (listing.sellerId && listing.sellerId !== user.userId) {
      void this.notifications
        .notifyUser({
          userId: listing.sellerId,
          type: 'comment',
          titleAr: 'رد جديد على إعلانك',
          bodyAr: `علّق ${user.username} على إعلان «${listing.arabicTitle}»`,
          data: { listingId, commentId: comment.id },
        })
        .catch(() => {});
    }

    await this.cache.del(`listing:${listingId}`);
    await this.cache.delPattern('listings:v2:*');
    return comment;
  }

  async deleteComment(user: JwtPayload, listingId: string, commentId: string) {
    if (!listingId || !commentId) throwApi(400, 'invalid_id', 'معرّف غير صالح');

    const listing = await this.repo.findActiveListingMeta(listingId);
    if (!listing) throwApi(404, 'not_found', 'الإعلان غير موجود');

    const comment = await this.repo.findCommentMeta(commentId, listingId);
    if (!comment) throwApi(404, 'not_found', 'التعليق غير موجود');

    const isCommentAuthor = comment.authorId === user.userId;
    const isListingOwner = listing.sellerId === user.userId;
    const isAdmin = user.role === 'ADMIN';

    if (!isCommentAuthor && !isListingOwner && !isAdmin) {
      throwApi(403, 'forbidden', 'غير مسموح');
    }

    await this.repo.deleteComment(commentId, listingId);
    await this.cache.del(`listing:${listingId}`);
    await this.cache.delPattern('listings:v2:*');
    return { deleted: true };
  }
}
