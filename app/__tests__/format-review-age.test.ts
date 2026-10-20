import { formatReviewAgeAr } from '@/lib/formatReviewAge';
import { canSubmitReview, reviewOathText } from '@/lib/reviewCopy';

const NOW = new Date('2026-10-20T12:00:00.000Z').getTime();

describe('formatReviewAgeAr', () => {
  it('matches the ratings screen ages', () => {
    expect(formatReviewAgeAr('2026-09-29T12:00:00.000Z', NOW)).toBe('٣ أسابيع');
    expect(formatReviewAgeAr('2026-08-20T12:00:00.000Z', NOW)).toBe('شهرين');
    expect(formatReviewAgeAr('2026-06-20T12:00:00.000Z', NOW)).toBe('٤ شهور');
  });

  it('uses dual and singular forms', () => {
    expect(formatReviewAgeAr('2026-10-13T12:00:00.000Z', NOW)).toBe('أسبوع');
    expect(formatReviewAgeAr('2026-10-06T12:00:00.000Z', NOW)).toBe('أسبوعين');
    expect(formatReviewAgeAr('2026-09-20T12:00:00.000Z', NOW)).toBe('شهر');
  });
});

describe('canSubmitReview', () => {
  const ready = {
    oath: true,
    purchased: true as boolean | null,
    recommend: false as boolean | null,
    comment: 'تعامل واضح',
    rating: 4,
  };

  it('stays disabled until the oath, both answers, stars, and a comment are set', () => {
    expect(canSubmitReview(ready)).toBe(true);
    expect(canSubmitReview({ ...ready, oath: false })).toBe(false);
    expect(canSubmitReview({ ...ready, purchased: null })).toBe(false);
    expect(canSubmitReview({ ...ready, recommend: null })).toBe(false);
    expect(canSubmitReview({ ...ready, comment: '   ' })).toBe(false);
    expect(canSubmitReview({ ...ready, comment: 'ا'.repeat(1001) })).toBe(false);
    expect(canSubmitReview({ ...ready, rating: 0 })).toBe(false);
  });

  it('builds the oath with the member name', () => {
    expect(reviewOathText('دكان مزاد . ابو مراد')).toContain('العضو دكان مزاد . ابو مراد');
    expect(reviewOathText('دكان مزاد . ابو مراد')).toContain('أتحمل مسؤولية صحة هذه المعلومات');
  });
});
