import { Injectable } from '@nestjs/common';
import { ApiException, throwApi } from '../../common/exceptions/api.exception';
import { LoggerService } from '../../common/services/logger.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { RedisService } from '../../redis/redis.service';
import { ReportsService } from '../../reports/reports.service';
import {
  REVIEW_COMMENT_MAX,
  REVIEW_PAGE_DEFAULT,
  type AdminReviewsQueryDto,
  type CreateUserReviewDto,
  type ReportUserReviewDto,
} from './user-reviews.dto';
import {
  UserReviewsRepository,
  type ReviewPerson,
  type ReviewRow,
} from './user-reviews.repository';

export const REVIEW_CREATE_LIMIT = 8;
export const REVIEW_CREATE_WINDOW_SEC = 60 * 60;
export const REVIEW_REPORT_LIMIT = 20;
export const REVIEW_REPORT_WINDOW_SEC = 60 * 60;

type Bucket = { count: number; resetAt: number };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

function publicPerson(person: ReviewPerson) {
  return {
    id: person.id,
    username: person.username,
    displayName: person.displayName,
    arabicName: person.arabicName,
    avatar: person.avatar,
  };
}

function publicReview(row: ReviewRow) {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    purchased: row.purchased,
    recommend: row.recommend,
    createdAt: row.createdAt,
    reviewer: publicPerson(row.reviewer),
  };
}

@Injectable()
export class UserReviewsService {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly repo: UserReviewsRepository,
    private readonly reports: ReportsService,
    private readonly redis: RedisService,
    private readonly logger: LoggerService,
  ) {}

  async list(
    targetId: string,
    cursor: string | undefined,
    limit: number | undefined,
    viewer?: JwtPayload,
  ) {
    const target = await this.repo.findActiveProfile(targetId);
    if (!target) throwApi(404, 'not_found', 'المستخدم غير موجود');

    if (viewer?.userId && viewer.userId !== targetId) {
      const targetBlockedViewer = await this.repo.hasBlock(
        targetId,
        viewer.userId,
      );
      if (targetBlockedViewer) {
        throwApi(403, 'blocked', 'لا يمكنك عرض هذا الملف');
      }
    }

    const pageSize = limit ?? REVIEW_PAGE_DEFAULT;
    const [summary, page, mine] = await Promise.all([
      this.repo.summarizeVisible(targetId),
      this.repo.listVisiblePage(targetId, cursor, pageSize),
      viewer?.userId
        ? this.repo.findPair(targetId, viewer.userId)
        : Promise.resolve(null),
    ]);

    return {
      target: publicPerson(target),
      average: summary.average,
      reviewCount: summary.reviewCount,
      positiveCount: summary.positiveCount,
      negativeCount: summary.negativeCount,
      reviews: page.reviews.map(publicReview),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      myReviewId: mine?.id ?? null,
    };
  }

  async create(targetId: string, reviewerId: string, dto: CreateUserReviewDto) {
    this.assertCreateInput(targetId, reviewerId, dto);
    await this.hitLimit(
      `rl:review-create:${reviewerId}`,
      REVIEW_CREATE_LIMIT,
      REVIEW_CREATE_WINDOW_SEC,
    );

    const target = await this.repo.findActiveProfile(targetId);
    if (!target) throwApi(404, 'not_found', 'المستخدم غير موجود');

    const [blockedByReviewer, blockedReviewer] = await Promise.all([
      this.repo.hasBlock(reviewerId, targetId),
      this.repo.hasBlock(targetId, reviewerId),
    ]);
    if (blockedByReviewer || blockedReviewer) {
      throwApi(403, 'blocked', 'لا يمكنك التفاعل مع هذا المستخدم');
    }

    const existing = await this.repo.findPair(targetId, reviewerId);
    if (existing) {
      throwApi(409, 'review_exists', 'لقد أضفت تقييمك مسبقاً ولا يمكن تعديله');
    }

    const comment = dto.comment.trim();
    let created: ReviewRow;
    try {
      created = await this.repo.createReview({
        targetId,
        reviewerId,
        rating: dto.rating,
        comment,
        purchased: dto.purchased,
        recommend: dto.recommend,
        oathAcceptedAt: new Date(),
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throwApi(
          409,
          'review_exists',
          'لقد أضفت تقييمك مسبقاً ولا يمكن تعديله',
        );
      }
      throw error;
    }

    const summary = await this.refreshCache(targetId);
    this.logger.info(
      { targetId, reviewerId, reviewId: created.id },
      'User review created',
    );

    return {
      review: publicReview(created),
      average: summary.average,
      reviewCount: summary.reviewCount,
      positiveCount: summary.positiveCount,
      negativeCount: summary.negativeCount,
    };
  }

  async report(
    targetId: string,
    reviewId: string,
    reporter: JwtPayload,
    dto: ReportUserReviewDto,
  ) {
    await this.hitLimit(
      `rl:review-report:${reporter.userId}`,
      REVIEW_REPORT_LIMIT,
      REVIEW_REPORT_WINDOW_SEC,
    );

    const review = await this.repo.findById(reviewId);
    if (!review || review.targetId !== targetId || review.hiddenAt) {
      throwApi(404, 'not_found', 'التقييم غير موجود');
    }
    if (review.reviewerId === reporter.userId) {
      throwApi(400, 'invalid_action', 'لا يمكنك الإبلاغ عن تقييمك');
    }

    return this.reports.create(reporter, {
      targetType: 'review',
      targetId: reviewId,
      reason: dto.reason.trim(),
      details: dto.details?.trim() || undefined,
    });
  }

  async adminList(query: AdminReviewsQueryDto) {
    const page = await this.repo.listAdmin({
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      search: query.search,
      visibility: query.visibility ?? 'all',
      recommend: query.recommend ?? 'all',
    });
    const reportCounts = await this.reportCounts(
      page.items.map((row) => row.id),
    );
    return {
      ...page,
      items: page.items.map((row) => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        purchased: row.purchased,
        recommend: row.recommend,
        createdAt: row.createdAt,
        hiddenAt: row.hiddenAt,
        hiddenReason: row.hiddenReason,
        oathAcceptedAt: row.oathAcceptedAt,
        reviewer: publicPerson(row.reviewer),
        target: publicPerson(row.target),
        reportCount: reportCounts.get(row.id) ?? 0,
      })),
    };
  }

  async adminGet(id: string) {
    const review = await this.repo.findById(id);
    if (!review) throwApi(404, 'not_found', 'التقييم غير موجود');
    const tickets = await this.repo.listReviewReports(id);
    const reports = tickets.filter((ticket) => {
      const meta = ticket.metadata as { targetType?: string } | null;
      return meta?.targetType === 'review';
    });
    return {
      review: {
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        purchased: review.purchased,
        recommend: review.recommend,
        oathAcceptedAt: review.oathAcceptedAt,
        createdAt: review.createdAt,
        hiddenAt: review.hiddenAt,
        hiddenReason: review.hiddenReason,
        hiddenBy: review.hiddenBy,
        reviewer: publicPerson(review.reviewer),
        target: publicPerson(review.target),
      },
      reports,
    };
  }

  async adminHide(id: string, actor: JwtPayload, reason: string) {
    const trimmed = reason.trim();
    if (trimmed.length < 3 || trimmed.length > 500) {
      throwApi(400, 'validation_error', 'اكتب سبب الإخفاء');
    }
    const review = await this.repo.findById(id);
    if (!review) throwApi(404, 'not_found', 'التقييم غير موجود');
    if (review.hiddenAt) {
      throwApi(409, 'already_hidden', 'هذا التقييم مخفي مسبقاً ولا يُحذف');
    }

    try {
      await this.repo.hide(id, {
        hiddenAt: new Date(),
        hiddenReason: trimmed,
        hiddenById: actor.userId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (
        message.includes('user_review_hide_final') ||
        message.includes('user_review_immutable')
      ) {
        throwApi(409, 'already_hidden', 'هذا التقييم مخفي مسبقاً ولا يُحذف');
      }
      throw error;
    }

    await this.repo.recordHideAudit({
      userId: review.targetId,
      actorId: actor.userId,
      reason: trimmed,
      metadata: {
        reviewId: review.id,
        reviewerId: review.reviewerId,
        targetId: review.targetId,
        rating: review.rating,
      },
    });

    const summary = await this.refreshCache(review.targetId);
    this.logger.info(
      { reviewId: review.id, by: actor.userId },
      'User review hidden',
    );
    return {
      id: review.id,
      hidden: true,
      average: summary.average,
      reviewCount: summary.reviewCount,
    };
  }

  private assertCreateInput(
    targetId: string,
    reviewerId: string,
    dto: CreateUserReviewDto,
  ) {
    if (targetId === reviewerId) {
      throwApi(400, 'invalid_action', 'لا يمكنك تقييم حسابك الخاص');
    }
    if (dto.oathAccepted !== true) {
      throwApi(400, 'oath_required', 'يجب الموافقة على التعهد قبل الإرسال');
    }
    if (!Number.isInteger(dto.rating) || dto.rating < 1 || dto.rating > 5) {
      throwApi(400, 'invalid_rating', 'التقييم يجب أن يكون بين 1 و 5');
    }
    if (
      typeof dto.purchased !== 'boolean' ||
      typeof dto.recommend !== 'boolean'
    ) {
      throwApi(400, 'validation_error', 'أجب عن السؤالين بنعم أو لا');
    }
    const comment = typeof dto.comment === 'string' ? dto.comment.trim() : '';
    if (!comment) {
      throwApi(400, 'comment_required', 'أضف تعليقك');
    }
    if (comment.length > REVIEW_COMMENT_MAX) {
      throwApi(400, 'comment_too_long', 'التعليق أطول من 1000 حرف');
    }
  }

  private async refreshCache(targetId: string) {
    const summary = await this.repo.summarizeVisible(targetId);
    await this.repo.writeRatingCache(
      targetId,
      summary.average ?? 0,
      summary.reviewCount,
    );
    await this.redis.cacheDel(`user:${targetId}`, `user:${targetId}:base`);
    return summary;
  }

  private async reportCounts(ids: string[]) {
    const counts = new Map<string, number>();
    if (ids.length === 0) return counts;
    const lists = await Promise.all(
      ids.map((id) => this.repo.listReviewReports(id)),
    );
    ids.forEach((id, index) => {
      const n = lists[index].filter((ticket) => {
        const meta = ticket.metadata as { targetType?: string } | null;
        return meta?.targetType === 'review';
      }).length;
      counts.set(id, n);
    });
    return counts;
  }

  private async hitLimit(key: string, limit: number, windowSec: number) {
    if (this.redis.isEnabled()) {
      try {
        const client = this.redis.getRedis();
        const n = await client.incr(key);
        if (n === 1) await client.expire(key, windowSec);
        if (n > limit) {
          throwApi(429, 'rate_limited', 'محاولات كثيرة، حاول بعد قليل');
        }
        return;
      } catch (error) {
        if (error instanceof ApiException) throw error;
        this.logger.warn(
          { err: error instanceof Error ? error.message : String(error), key },
          'Review rate limit redis failed, using memory bucket',
        );
      }
    }

    const now = Date.now();
    const slot = this.buckets.get(key);
    if (!slot || slot.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
      return;
    }
    slot.count += 1;
    if (slot.count > limit) {
      throwApi(429, 'rate_limited', 'محاولات كثيرة، حاول بعد قليل');
    }
  }
}
