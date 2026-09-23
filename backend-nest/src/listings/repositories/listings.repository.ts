import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  notDeleted,
  softDeleteFields,
} from '../../common/utils/soft-delete.util';

const SELLER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  arabicName: true,
  avatar: true,
  verified: true,
  country: true,
} as const;

const SELLER_DETAIL_SELECT = {
  ...SELLER_SELECT,
  bio: true,
} as const;

const MARKET_CATEGORY_SELECT = {
  id: true,
  nameAr: true,
  slug: true,
  emoji: true,
  icon: true,
  requiresWeight: true,
} as const;

@Injectable()
export class ListingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(params: {
    where: Prisma.ListingWhereInput;
    take: number;
    cursor?: string;
    orderBy: Prisma.ListingOrderByWithRelationInput[];
  }) {
    return this.prisma.listing.findMany({
      where: params.where,
      take: params.take,
      cursor: params.cursor ? { id: params.cursor } : undefined,
      skip: params.cursor ? 1 : 0,
      orderBy: params.orderBy,
      include: {
        seller: {
          select: {
            ...SELLER_SELECT,
            subscription: {
              select: { planId: true, planAudience: true },
            },
          },
        },
        marketCategory: { select: MARKET_CATEGORY_SELECT },
        marketSubcategory: { select: MARKET_CATEGORY_SELECT },
      },
    });
  }

  findById(id: string) {
    return this.prisma.listing.findFirst({
      where: { id, ...notDeleted },
      include: {
        seller: { select: SELLER_DETAIL_SELECT },
        fee: {
          select: {
            id: true,
            status: true,
            commission: true,
            dueDate: true,
            saleAmount: true,
          },
        },
        marketCategory: { select: MARKET_CATEGORY_SELECT },
        marketSubcategory: { select: MARKET_CATEGORY_SELECT },
      },
    });
  }

  findOwnerMeta(id: string) {
    return this.prisma.listing.findUnique({
      where: { id },
      select: {
        sellerId: true,
        origin: true,
        category: true,
        categoryId: true,
        subcategoryId: true,
        country: true,
        weightKg: true,
        videoUrl: true,
        pinned: true,
        featured: true,
        editCount: true,
        marketCategory: { select: { requiresWeight: true, slug: true } },
      },
    });
  }

  findSellerId(id: string) {
    return this.prisma.listing.findUnique({
      where: { id },
      select: { sellerId: true, origin: true },
    });
  }

  incrementViews(id: string) {
    return this.prisma.listing.update({
      where: { id },
      data: { views: { increment: 1 } },
    });
  }

  update(id: string, data: Prisma.ListingUpdateInput) {
    return this.prisma.listing.update({ where: { id }, data });
  }

  markSold(id: string) {
    return this.prisma.listing.update({
      where: { id },
      data: { status: 'sold', ...softDeleteFields() },
    });
  }

  softDelete(
    id: string,
    extra?: {
      sellerDeclaredSold?: boolean;
      sellerDeclaredSoldAt?: Date | null;
      deleteReason?: string;
    },
  ) {
    return this.prisma.listing.update({
      where: { id },
      data: {
        status: 'suspended',
        ...softDeleteFields(),
        ...(extra?.sellerDeclaredSold !== undefined
          ? { sellerDeclaredSold: extra.sellerDeclaredSold }
          : {}),
        ...(extra?.sellerDeclaredSoldAt !== undefined
          ? { sellerDeclaredSoldAt: extra.sellerDeclaredSoldAt }
          : {}),
        ...(extra?.deleteReason !== undefined
          ? { deleteReason: extra.deleteReason }
          : {}),
      },
    });
  }

  createListingWithFee(params: {
    userId: string;
    featured: boolean;
    pinned?: boolean;
    createFee?: boolean;
    data: Omit<Prisma.ListingUncheckedCreateInput, 'sellerId'>;
    commission: number;
    dueDate?: Date | null;
    category: string;
    quantity: number;
    price: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const sub = await tx.subscription.findUnique({
        where: { userId: params.userId },
        select: {
          dailyAdsUsed: true,
          dailyAdsWindowStart: true,
        },
      });

      const usageUpdate: Prisma.SubscriptionUpdateInput = {
        listingsUsed: { increment: 1 },
        dailyAdsUsed: { increment: 1 },
        dailyAdsWindowStart: sub?.dailyAdsWindowStart ?? now,
      };
      if (params.featured) {
        usageUpdate.featuredAdsUsed = { increment: 1 };
      }
      if (params.pinned) {
        usageUpdate.pinnedAdsUsed = { increment: 1 };
      }

      const created = await tx.listing.create({
        data: {
          ...params.data,
          sellerId: params.userId,
          ...(params.createFee
            ? {
                fee: {
                  create: {
                    userId: params.userId,
                    category: params.category,
                    quantity: params.quantity,
                    price: params.price,
                    commission: params.commission,
                    dueDate: params.dueDate ?? null,
                    status: 'pending',
                  },
                },
              }
            : {}),
        },
        include: {
          seller: {
            select: {
              id: true,
              username: true,
              displayName: true,
              arabicName: true,
              avatar: true,
            },
          },
          fee: true,
        },
      });

      await tx.subscription.update({
        where: { userId: params.userId },
        data: usageUpdate,
      });

      return created;
    });
  }

  applyPlanPromotion(params: {
    userId: string;
    listingId: string;
    setFeatured?: boolean;
    setPinned?: boolean;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const usageUpdate: Prisma.SubscriptionUpdateInput = {};
      if (params.setFeatured) {
        usageUpdate.featuredAdsUsed = { increment: 1 };
      }
      if (params.setPinned) {
        usageUpdate.pinnedAdsUsed = { increment: 1 };
      }

      const listingUpdate: Prisma.ListingUpdateInput = {};
      if (params.setFeatured) listingUpdate.featured = true;
      if (params.setPinned) listingUpdate.pinned = true;

      const updated = await tx.listing.update({
        where: { id: params.listingId },
        data: listingUpdate,
        include: {
          seller: { select: SELLER_SELECT },
          fee: {
            select: {
              id: true,
              status: true,
              commission: true,
              dueDate: true,
              saleAmount: true,
            },
          },
        },
      });

      if (Object.keys(usageUpdate).length > 0) {
        await tx.subscription.update({
          where: { userId: params.userId },
          data: usageUpdate,
        });
      }

      return updated;
    });
  }

  findActiveListingMeta(id: string) {
    return this.prisma.listing.findFirst({
      where: { id, ...notDeleted },
      select: { id: true, sellerId: true, arabicTitle: true },
    });
  }

  findComments(listingId: string) {
    return this.prisma.listingComment.findMany({
      where: { listingId },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            arabicName: true,
            avatar: true,
            verified: true,
          },
        },
      },
    });
  }

  createComment(listingId: string, authorId: string, content: string) {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.listingComment.create({
        data: { listingId, authorId, content },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              arabicName: true,
              avatar: true,
              verified: true,
            },
          },
        },
      });
      await tx.listing.update({
        where: { id: listingId },
        data: { commentsCount: { increment: 1 } },
      });
      return created;
    });
  }

  findCommentMeta(commentId: string, listingId: string) {
    return this.prisma.listingComment.findFirst({
      where: { id: commentId, listingId },
      select: { id: true, authorId: true, listingId: true },
    });
  }

  deleteComment(commentId: string, listingId: string) {
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.listingComment.deleteMany({
        where: { id: commentId, listingId },
      });
      if (deleted.count === 0) {
        throw new Error('COMMENT_NOT_FOUND');
      }

      const commentsCount = await tx.listingComment.count({
        where: { listingId },
      });
      await tx.listing.update({
        where: { id: listingId },
        data: { commentsCount },
      });
      return true;
    });
  }
}
