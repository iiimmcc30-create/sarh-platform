import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { throwApi } from '../../common/exceptions/api.exception';
import { REVIEW_PAGE_DEFAULT } from './user-reviews.dto';

const personSelect = {
  id: true,
  username: true,
  displayName: true,
  arabicName: true,
  avatar: true,
} satisfies Prisma.UserSelect;

export type ReviewPerson = Prisma.UserGetPayload<{
  select: typeof personSelect;
}>;

export type ReviewRow = Prisma.UserReviewGetPayload<{
  include: { reviewer: { select: typeof personSelect } };
}>;

const reviewInclude = {
  reviewer: { select: personSelect },
} satisfies Prisma.UserReviewInclude;

function roundRating(value: number): number {
  return Math.round(value * 100) / 100;
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === code
  );
}

@Injectable()
export class UserReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveProfile(id: string) {
    return this.prisma.user.findFirst({
      where: { id, isActive: true, deletedAt: null },
      select: personSelect,
    });
  }

  async hasBlock(blockerId: string, blockedId: string): Promise<boolean> {
    const row = await this.prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      select: { id: true },
    });
    return !!row;
  }

  findPair(targetId: string, reviewerId: string) {
    return this.prisma.userReview.findUnique({
      where: { targetId_reviewerId: { targetId, reviewerId } },
      select: { id: true, rating: true, hiddenAt: true },
    });
  }

  createReview(data: {
    targetId: string;
    reviewerId: string;
    rating: number;
    comment: string;
    purchased: boolean;
    recommend: boolean;
    oathAcceptedAt: Date;
  }) {
    return this.prisma.userReview.create({
      data,
      include: reviewInclude,
    });
  }

  async listVisiblePage(
    targetId: string,
    cursor: string | undefined,
    limit: number,
  ) {
    const take = limit + 1;
    try {
      const rows = await this.prisma.userReview.findMany({
        where: { targetId, hiddenAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: reviewInclude,
      });
      const hasMore = rows.length > limit;
      const reviews = hasMore ? rows.slice(0, limit) : rows;
      return {
        reviews,
        hasMore,
        nextCursor: hasMore ? (reviews[reviews.length - 1]?.id ?? null) : null,
      };
    } catch (error) {
      if (isPrismaCode(error, 'P2025')) {
        throwApi(400, 'invalid_cursor', 'مؤشر الصفحة غير صالح');
      }
      throw error;
    }
  }

  /** Visible reviews only — hidden rows are excluded from the average and both counts. */
  async summarizeVisible(targetId: string) {
    const where = { targetId, hiddenAt: null };
    const [agg, positiveCount, negativeCount] = await Promise.all([
      this.prisma.userReview.aggregate({
        where,
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.userReview.count({ where: { ...where, recommend: true } }),
      this.prisma.userReview.count({ where: { ...where, recommend: false } }),
    ]);
    const reviewCount = agg._count._all;
    const average = reviewCount > 0 ? roundRating(agg._avg.rating ?? 0) : null;
    return { average, reviewCount, positiveCount, negativeCount };
  }

  writeRatingCache(targetId: string, rating: number, reviewCount: number) {
    return this.prisma.user.update({
      where: { id: targetId },
      data: { rating, reviewCount },
      select: { id: true },
    });
  }

  findById(id: string) {
    return this.prisma.userReview.findUnique({
      where: { id },
      include: {
        reviewer: { select: personSelect },
        target: { select: personSelect },
        hiddenBy: { select: { id: true, username: true } },
      },
    });
  }

  /**
   * Hide columns only. The database trigger rejects any change to the comment,
   * rating, answers, or a second hide.
   */
  hide(
    id: string,
    patch: { hiddenAt: Date; hiddenReason: string; hiddenById: string },
  ) {
    return this.prisma.userReview.update({
      where: { id },
      data: patch,
      select: { id: true, targetId: true, hiddenAt: true },
    });
  }

  recordHideAudit(params: {
    userId: string;
    actorId: string;
    reason: string;
    metadata: Record<string, unknown>;
  }) {
    return this.prisma.adminAccountAction.create({
      data: {
        userId: params.userId,
        actorId: params.actorId,
        action: 'hide_user_review',
        reason: params.reason,
        metadata: params.metadata as Prisma.InputJsonValue,
      },
    });
  }

  async listAdmin(query: {
    page: number;
    pageSize: number;
    search?: string;
    visibility?: 'all' | 'visible' | 'hidden';
    recommend?: 'all' | 'yes' | 'no';
  }) {
    const search = query.search?.trim();
    const where: Prisma.UserReviewWhereInput = {
      ...(query.visibility === 'hidden' ? { hiddenAt: { not: null } } : {}),
      ...(query.visibility === 'visible' ? { hiddenAt: null } : {}),
      ...(query.recommend === 'yes' ? { recommend: true } : {}),
      ...(query.recommend === 'no' ? { recommend: false } : {}),
      ...(search
        ? {
            OR: [
              { comment: { contains: search, mode: 'insensitive' } },
              {
                reviewer: {
                  OR: [
                    { username: { contains: search, mode: 'insensitive' } },
                    { displayName: { contains: search, mode: 'insensitive' } },
                    { arabicName: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
              {
                target: {
                  OR: [
                    { username: { contains: search, mode: 'insensitive' } },
                    { displayName: { contains: search, mode: 'insensitive' } },
                    { arabicName: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.userReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          reviewer: { select: personSelect },
          target: { select: personSelect },
        },
      }),
      this.prisma.userReview.count({ where }),
    ]);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  listReviewReports(reviewId: string) {
    return this.prisma.supportTicket.findMany({
      where: {
        type: 'REPORT',
        deletedAt: null,
        metadata: { path: ['targetId'], equals: reviewId },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        subject: true,
        description: true,
        createdAt: true,
        reporterId: true,
        metadata: true,
      },
    });
  }
}

export const DEFAULT_REVIEW_PAGE = REVIEW_PAGE_DEFAULT;
