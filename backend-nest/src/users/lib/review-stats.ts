/**
 * Visible-review stats. Hidden rows are excluded from every count.
 * Star-only rows migrated before comments (null oath or blank comment) stay in
 * the average and review count, and stay out of the positive/negative comment
 * counts — a default `recommend: false` must not become a negative comment.
 */

export type ReviewStatRow = {
  rating: number;
  recommend: boolean;
  comment: string;
  oathAcceptedAt: Date | null;
  hiddenAt: Date | null;
};

export function isCommentReview(row: ReviewStatRow): boolean {
  return row.hiddenAt == null && row.oathAcceptedAt != null && row.comment.trim().length > 0;
}

export function summarizeReviews(rows: ReviewStatRow[]) {
  const visible = rows.filter((row) => row.hiddenAt == null);
  const commented = visible.filter((row) => isCommentReview(row));
  const reviewCount = visible.length;
  const sum = visible.reduce((total, row) => total + row.rating, 0);
  return {
    reviewCount,
    average: reviewCount > 0 ? sum / reviewCount : null,
    positiveCount: commented.filter((row) => row.recommend).length,
    negativeCount: commented.filter((row) => !row.recommend).length,
  };
}

export function commentToneWhere(targetId: string, recommend: boolean) {
  return {
    targetId,
    hiddenAt: null,
    recommend,
    oathAcceptedAt: { not: null },
    NOT: { comment: '' },
  };
}

export function visibleReviewWhere(targetId: string) {
  return { targetId, hiddenAt: null };
}

type RatingDb = {
  userReview: {
    aggregate(args: {
      where: { targetId: string; hiddenAt: null };
      _avg: { rating: true };
      _count: { rating: true };
    }): Promise<{ _avg: { rating: number | null }; _count: { rating: number } }>;
  };
  user: {
    update(args: {
      where: { id: string };
      data: { rating: number; reviewCount: number };
      select: { id: true };
    }): Promise<unknown>;
  };
};

/** Recompute User.rating / User.reviewCount from non-hidden reviews. */
export async function recomputeUserRatingCache(db: RatingDb, targetId: string) {
  const agg = await db.userReview.aggregate({
    where: { targetId, hiddenAt: null },
    _avg: { rating: true },
    _count: { rating: true },
  });
  const reviewCount = agg._count.rating;
  const rating = reviewCount > 0 ? (agg._avg.rating ?? 0) : 0;
  await db.user.update({
    where: { id: targetId },
    data: { rating, reviewCount },
    select: { id: true },
  });
  return {
    rating: reviewCount > 0 ? rating : null,
    reviewCount,
  };
}

export function paginateByCursor<T extends { id: string }>(
  ordered: T[],
  cursor: string | undefined,
  limit: number,
):
  | { error: 'invalid_cursor' }
  | { page: T[]; hasMore: boolean; nextCursor: string | null } {
  let start = 0;
  if (cursor) {
    const index = ordered.findIndex((row) => row.id === cursor);
    if (index < 0) return { error: 'invalid_cursor' };
    start = index + 1;
  }
  const window = ordered.slice(start, start + limit + 1);
  const hasMore = window.length > limit;
  const page = hasMore ? window.slice(0, limit) : window;
  return {
    page,
    hasMore,
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}
