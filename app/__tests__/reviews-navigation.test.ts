import { readFileSync } from 'fs';
import { join } from 'path';

function src(rel: string) {
  return readFileSync(join(__dirname, '..', rel), 'utf8');
}

describe('profile rating opens the reviews screen', () => {
  it('routes a profile tap to التقييمات instead of the old rating sheet', () => {
    const visitor = src('app/users/[id].tsx');
    const own = src('app/(tabs)/profile.tsx');
    const root = src('app/_layout.tsx');
    expect(visitor).toContain("pathname: '/users/reviews/[id]'");
    expect(own).toContain("pathname: '/users/reviews/[id]'");
    expect(visitor).not.toContain('RatingModal');
    expect(visitor).not.toContain('rateUser');
    expect(root).toContain('users/reviews/[id]');
  });

  it('the add dialog requires the oath and does not offer an edit', () => {
    const dialog = src('components/feature/AddReviewDialog.tsx');
    const screen = src('app/users/reviews/[id].tsx');
    expect(dialog).toContain('إضافة تقييم');
    expect(dialog).toContain('أضف تعليقك ...');
    expect(dialog).toContain('canSubmitReview');
    expect(dialog).not.toContain('تعديل تقييمك');
    expect(screen).toContain('تعليق ايجابي');
    expect(screen).toContain('تعليق سلبي');
    expect(screen).toContain('لا يمكن تعديله أو حذفه');
  });
});
