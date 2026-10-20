/**
 * Visible-review stats. Hidden rows are excluded from every count.
 *
 * A full review (oath accepted, non-empty comment) counts by `recommend`.
 * A migrated star-only row (empty comment, null oath) counts by stars:
 * 4–5 positive, 1–2 negative, 3 neutral. Neutral rows stay in the star
 * average and the review count.
 */

export type ReviewStatRow = {
  rating: number;
  recommend: boolean;
  comment: string;
  oathAcceptedAt: Date | null;
  hiddenAt: Date | null;
};

export function isLegacyStarReview(row: ReviewStatRow): boolean {
  return row.oathAcceptedAt == null && row.comment.trim().length === 0;
}

export function isCommentReview(row: ReviewStatRow): boolean {
  return (
    row.hiddenAt == null &&
    row.oathAcceptedAt != null &&
    row.comment.trim().length > 0
  );
}

function toneOf(row: ReviewStatRow): 'positive' | 'negative' | null {
  if (row.hiddenAt != null) return null;
  if (isLegacyStarReview(row)) {
    if (row.rating >= 4) return 'positive';
    if (row.rating <= 2) return 'negative';
    return null;
  }
  if (isCommentReview(row)) return row.recommend ? 'positive' : 'negative';
  return null;
}

export function summarizeReviews(rows: ReviewStatRow[]) {
  const visible = rows.filter((row) => row.hiddenAt == null);
  const reviewCount = visible.length;
  const sum = visible.reduce((total, row) => total + row.rating, 0);
  let positiveCount = 0;
  let negativeCount = 0;
  for (const row of visible) {
    const tone = toneOf(row);
    if (tone === 'positive') positiveCount += 1;
    else if (tone === 'negative') negativeCount += 1;
  }
  return {
    reviewCount,
    average: reviewCount > 0 ? sum / reviewCount : null,
    positiveCount,
    negativeCount,
  };
}

/**
 * Positive (`recommend` true) matches a recommending comment or a legacy
 * 4–5 star row. Negative matches a non-recommending comment or a legacy
 * 1–2 star row. A legacy 3 matches neither side.
 */
export function commentToneWhere(targetId: string, recommend: boolean) {
  return {
    targetId,
    hiddenAt: null,
    OR: [
      {
        recommend,
        oathAcceptedAt: { not: null },
        NOT: { comment: '' },
      },
      {
        comment: '',
        oathAcceptedAt: null,
        rating: recommend ? { gte: 4 } : { lte: 2 },
      },
    ],
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
    }): Promise<{
      _avg: { rating: number | null };
      _count: { rating: number };
    }>;
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
