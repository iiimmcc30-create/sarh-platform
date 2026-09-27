import {
  LISTING_DAILY_LIMIT_MESSAGE_AR,
  LISTING_EDIT_LIMIT_MESSAGE_AR,
  resolveListingCreateDailyLimit,
} from '../listing-policy';

describe('listing publish policy', () => {
  it('forces regular users to one listing per 24 hours', () => {
    expect(resolveListingCreateDailyLimit('USER', -1)).toEqual({
      unlimited: false,
      limit: 1,
    });
    expect(resolveListingCreateDailyLimit(undefined, 20)).toEqual({
      unlimited: false,
      limit: 1,
    });
  });

  it('keeps admin unlimited', () => {
    expect(resolveListingCreateDailyLimit('ADMIN', 1).unlimited).toBe(true);
  });

  it('does not mention upgrading a plan', () => {
    expect(LISTING_DAILY_LIMIT_MESSAGE_AR).not.toContain('ترقية الباقة');
    expect(LISTING_EDIT_LIMIT_MESSAGE_AR).not.toContain('ترقية الباقة');
  });
});
