import {
  commentToneWhere,
  paginateByCursor,
  summarizeReviews,
  type ReviewStatRow,
} from './review-stats';

function row(
  partial: Partial<ReviewStatRow> & Pick<ReviewStatRow, 'rating'>,
): ReviewStatRow {
  return {
    recommend: false,
    comment: '',
    oathAcceptedAt: null,
    hiddenAt: null,
    ...partial,
  };
}

describe('summarizeReviews', () => {
  const oath = new Date('2026-01-01T00:00:00.000Z');

  it('counts full reviews by recommend and legacy 4–5 stars as positive', () => {
    const stats = summarizeReviews([
      row({
        rating: 5,
        recommend: true,
        comment: 'ممتاز',
        oathAcceptedAt: oath,
      }),
      row({ rating: 4, recommend: true, comment: 'جيد', oathAcceptedAt: oath }),
      row({
        rating: 2,
        recommend: false,
        comment: 'سيء',
        oathAcceptedAt: oath,
      }),
      row({
        rating: 1,
        recommend: false,
        comment: 'مخفي',
        oathAcceptedAt: oath,
        hiddenAt: new Date(),
      }),
      row({ rating: 5, recommend: false, comment: '' }),
      row({
        rating: 3,
        recommend: false,
        comment: '   ',
        oathAcceptedAt: oath,
      }),
    ]);

    expect(stats.positiveCount).toBe(3);
    expect(stats.negativeCount).toBe(1);
    expect(stats.reviewCount).toBe(5);
    expect(stats.average).toBeCloseTo((5 + 4 + 2 + 5 + 3) / 5);
  });

  it('buckets migrated star-only rows and keeps a non-recommend comment negative', () => {
    const stats = summarizeReviews([
      row({ rating: 5, comment: '' }),
      row({ rating: 4, comment: '  ' }),
      row({ rating: 2, comment: '' }),
      row({ rating: 1, comment: '' }),
      row({ rating: 3, comment: '' }),
      row({ rating: 3, comment: '', hiddenAt: new Date() }),
      row({
        rating: 5,
        recommend: false,
        comment: 'لا أنصح',
        oathAcceptedAt: oath,
      }),
      row({
        rating: 1,
        recommend: true,
        comment: 'أنصح',
        oathAcceptedAt: oath,
      }),
    ]);

    expect(stats.positiveCount).toBe(3);
    expect(stats.negativeCount).toBe(3);
    expect(stats.reviewCount).toBe(7);
    expect(stats.average).toBeCloseTo((5 + 4 + 2 + 1 + 3 + 5 + 1) / 7);
  });

  it('returns a null average when every review is hidden', () => {
    const stats = summarizeReviews([
      row({
        rating: 5,
        recommend: true,
        comment: 'مخفي',
        oathAcceptedAt: oath,
        hiddenAt: new Date(),
      }),
    ]);
    expect(stats).toEqual({
      positiveCount: 0,
      negativeCount: 0,
      reviewCount: 0,
      average: null,
    });
  });
});

describe('commentToneWhere', () => {
  it('matches recommending comments or legacy 4–5, and the negative mirror', () => {
    expect(commentToneWhere('target-1', true)).toEqual({
      targetId: 'target-1',
      hiddenAt: null,
      OR: [
        {
          recommend: true,
          oathAcceptedAt: { not: null },
          NOT: { comment: '' },
        },
        {
          comment: '',
          oathAcceptedAt: null,
          rating: { gte: 4 },
        },
      ],
    });
    expect(commentToneWhere('target-1', false)).toEqual({
      targetId: 'target-1',
      hiddenAt: null,
      OR: [
        {
          recommend: false,
          oathAcceptedAt: { not: null },
          NOT: { comment: '' },
        },
        {
          comment: '',
          oathAcceptedAt: null,
          rating: { lte: 2 },
        },
      ],
    });
  });
});

describe('paginateByCursor', () => {
  const rows = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));

  it('returns the first page and a cursor', () => {
    expect(paginateByCursor(rows, undefined, 2)).toEqual({
      page: [{ id: 'a' }, { id: 'b' }],
      hasMore: true,
      nextCursor: 'b',
    });
  });

  it('continues after the cursor without repeating earlier rows', () => {
    expect(paginateByCursor(rows, 'b', 2)).toEqual({
      page: [{ id: 'c' }, { id: 'd' }],
      hasMore: true,
      nextCursor: 'd',
    });
  });

  it('ends on the last short page', () => {
    expect(paginateByCursor(rows, 'd', 2)).toEqual({
      page: [{ id: 'e' }],
      hasMore: false,
      nextCursor: null,
    });
  });

  it('rejects an unknown cursor', () => {
    expect(paginateByCursor(rows, 'missing', 2)).toEqual({
      error: 'invalid_cursor',
    });
  });
});
