import { readFileSync } from 'fs';
import path from 'path';
import { formatReviewAgeAr } from '@/lib/reviewAge';
import {
  canSubmitReview,
  negativeReviewsLabel,
  positiveReviewsLabel,
  reviewOathText,
  reviewPurchaseQuestion,
  reviewRecommendQuestion,
} from '@/lib/reviewForm';

const src = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8');

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 5, 1);

describe('review age', () => {
  it('uses the marketplace phrases from the reference list', () => {
    expect(formatReviewAgeAr(new Date(now - 21 * DAY), now)).toBe('٣ أسابيع');
    expect(formatReviewAgeAr(new Date(now - 60 * DAY), now)).toBe('شهرين');
    expect(formatReviewAgeAr(new Date(now - 120 * DAY), now)).toBe('٤ شهور');
    expect(formatReviewAgeAr(new Date(now - 7 * DAY), now)).toBe('أسبوع');
  });
});

describe('add-review gate', () => {
  const ready = {
    oath: true,
    purchased: true as boolean | null,
    recommend: false as boolean | null,
    rating: 4,
    comment: 'تعامل جيد',
  };

  it('stays closed until the oath, both answers, stars and a comment are set', () => {
    expect(canSubmitReview(ready)).toBe(true);
    expect(canSubmitReview({ ...ready, oath: false })).toBe(false);
    expect(canSubmitReview({ ...ready, purchased: null })).toBe(false);
    expect(canSubmitReview({ ...ready, recommend: null })).toBe(false);
    expect(canSubmitReview({ ...ready, rating: 0 })).toBe(false);
    expect(canSubmitReview({ ...ready, comment: '   ' })).toBe(false);
    expect(canSubmitReview({ ...ready, comment: 'ا'.repeat(1001) })).toBe(false);
  });

  it('builds the oath and the two questions with the member name', () => {
    expect(reviewOathText('أبو مراد')).toContain('من العضو أبو مراد');
    expect(reviewOathText('أبو مراد')).toContain('أتحمل مسؤولية صحة هذه المعلومات');
    expect(reviewPurchaseQuestion('أبو مراد')).toBe('هل قمت بشراء سلعة من أبو مراد؟');
    expect(reviewRecommendQuestion('أبو مراد')).toBe('هل تنصح بالتعامل مع البائع أبو مراد؟');
    expect(positiveReviewsLabel(5)).toBe('5 تعليق ايجابي');
    expect(negativeReviewsLabel(0)).toBe('0 تعليق سلبي');
  });
});

describe('reviews screen wiring', () => {
  it('opens التقييمات from any profile and no longer edits a rating', () => {
    const visitor = src('app/users/[id].tsx');
    const own = src('app/(tabs)/profile.tsx');
    const screen = src('app/reviews/[userId].tsx');
    const dialog = src('components/feature/AddReviewDialog.tsx');
    expect(visitor).toContain("pathname: '/reviews/[userId]'");
    expect(visitor).not.toContain('RatingModal');
    expect(visitor).not.toContain('rateUser');
    expect(own).toContain('onRatePress');
    expect(own).toContain("pathname: '/reviews/[userId]'");
    expect(screen).toContain('التقييمات');
    expect(screen).toContain('إضافة تقييم');
    expect(screen).toContain('positiveReviewsLabel');
    expect(screen).toContain('negativeReviewsLabel');
    expect(dialog).toContain('canSubmitReview');
    expect(dialog).toContain('أضف تعليقك ...');
    expect(src('services/users.ts')).not.toContain('/rate');
  });
});
