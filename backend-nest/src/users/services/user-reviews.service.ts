import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { throwApi } from '../../common/exceptions/api.exception';
import { LoggerService } from '../../common/services/logger.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { ReportsService } from '../../reports/reports.service';
import { RedisService } from '../../redis/redis.service';
import {
  REVIEW_COMMENT_MAX,
  type CreateUserReviewDto,
  type ListUserReviewsQueryDto,
  type ReportUserReviewDto,
} from '../dto/user-reviews.dto';
import { ReviewCreateLimiter } from '../lib/review-create-limiter';
import { UsersRepository } from '../repositories/users.repository';

const DEFAULT_PAGE = 15;

@Injectable()
export class UserReviewsService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly reports: ReportsService,
    private readonly redis: RedisService,
    private readonly logger: LoggerService,
    private readonly createLimiter: ReviewCreateLimiter,
  ) {}

  async list(
    targetId: string,
    query: ListUserReviewsQueryDto,
    viewer?: JwtPayload,
  ) {
    const target = await this.repo.findReviewTarget(targetId);
    if (!target) throwApi(404, 'not_found', 'المستخدم غير موجود');

    if (viewer?.userId && viewer.userId !== targetId) {
      const blockedViewer = await this.repo.findBlock(targetId, viewer.userId);
      if (blockedViewer) {
        throwApi(403, 'blocked', 'لا يمكنك عرض هذا الملف');
      }
    }

    const limit = query.limit ?? DEFAULT_PAGE;
    let rows;
    try {
      rows = await this.repo.listVisibleReviews(targetId, {
        cursor: query.cursor,
        take: limit + 1,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throwApi(400, 'invalid_cursor', 'مؤشر الصفحة غير صالح');
      }
      throw err;
    }

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const [stats, viewerReview] = await Promise.all([
      this.repo.reviewStats(targetId),
      viewer?.userId
        ? this.repo.findReviewByPair(targetId, viewer.userId)
        : Promise.resolve(null),
    ]);

    return {
      target,
      average: stats.average,
      reviewCount: stats.reviewCount,
      positiveCount: stats.positiveCount,
      negativeCount: stats.negativeCount,
      viewerHasReviewed: !!viewerReview,
      reviews: page.map((row) => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        purchased: row.purchased,
        recommend: row.recommend,
        legacy: row.oathAcceptedAt == null,
        createdAt: row.createdAt.toISOString(),
        reviewer: row.reviewer,
      })),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  /**
   * Create the only review this account may leave on the target.
   * There is no update or delete path — a second call is a conflict.
   */
  async create(targetId: string, reviewerId: string, dto: CreateUserReviewDto) {
    this.assertCreatePayload(dto);
    if (targetId === reviewerId) {
      throwApi(400, 'invalid_action', 'لا يمكنك تقييم حسابك الخاص');
    }

    const target = await this.repo.findActiveUserId(targetId);
    if (!target) throwApi(404, 'not_found', 'المستخدم غير موجود');

    const [blockedByMe, blockedMe, existing] = await Promise.all([
      this.repo.findBlock(reviewerId, targetId),
      this.repo.findBlock(targetId, reviewerId),
      this.repo.findReviewByPair(targetId, reviewerId),
    ]);
    if (blockedByMe || blockedMe) {
      throwApi(403, 'blocked', 'لا يمكنك التفاعل مع هذا المستخدم');
    }
    if (existing) {
      throwApi(
        409,
        'already_reviewed',
        'لقد قيّمت هذا الحساب مسبقاً ولا يمكن تعديل التقييم',
      );
    }

    this.createLimiter.assert(reviewerId);

    const oathAcceptedAt = new Date();
    try {
      await this.repo.createUserReview({
        targetId,
        reviewerId,
        rating: dto.rating,
        purchased: dto.purchased,
        recommend: dto.recommend,
        comment: dto.comment.trim(),
        oathAcceptedAt,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throwApi(
          409,
          'already_reviewed',
          'لقد قيّمت هذا الحساب مسبقاً ولا يمكن تعديل التقييم',
        );
      }
      throw err;
    }

    const cache = await this.repo.recomputeRatingCache(targetId);
    await this.redis.cacheDel(`user:${targetId}`, `user:${targetId}:base`);
    this.logger.info(
      { targetId, reviewerId, rating: dto.rating },
      'User review created',
    );

    return {
      rating: cache.rating,
      reviewCount: cache.reviewCount,
      created: true,
    };
  }

  async report(
    targetId: string,
    reviewId: string,
    reporter: JwtPayload,
    dto: ReportUserReviewDto,
  ) {
    const review = await this.repo.findReviewById(reviewId);
    if (!review || review.targetId !== targetId || review.hiddenAt) {
      throwApi(404, 'not_found', 'التقييم غير موجود');
    }
    if (review.reviewerId === reporter.userId) {
      throwApi(400, 'invalid_action', 'لا يمكنك الإبلاغ عن تقييمك');
    }
    return this.reports.create(reporter, {
      targetType: 'review',
      targetId: reviewId,
      reason: dto.reason,
      details: dto.details,
    });
  }

  private assertCreatePayload(dto: CreateUserReviewDto) {
    if (dto.oathAccepted !== true) {
      throwApi(400, 'oath_required', 'يجب الموافقة على التعهد قبل إرسال التقييم');
    }
    if (typeof dto.purchased !== 'boolean' || typeof dto.recommend !== 'boolean') {
      throwApi(400, 'validation_error', 'أجب عن سؤال الشراء والتوصية');
    }
    if (!Number.isInteger(dto.rating) || dto.rating < 1 || dto.rating > 5) {
      throwApi(400, 'invalid_rating', 'التقييم يجب أن يكون بين 1 و 5');
    }
    const comment = typeof dto.comment === 'string' ? dto.comment.trim() : '';
    if (!comment) {
      throwApi(400, 'validation_error', 'أضف تعليقاً قبل الإرسال');
    }
    if (comment.length > REVIEW_COMMENT_MAX) {
      throwApi(400, 'validation_error', 'التعليق يجب ألا يتجاوز 1000 حرف');
    }
  }
}
