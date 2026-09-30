import {
  LISTING_DAILY_LIMIT_MESSAGE_AR,
  LISTING_EDIT_LIMIT_MESSAGE_AR,
  listingDailyLimitMessageAr,
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

  it('adds verification subscription extra daily listings (Blue +3, Gold +6)', () => {
    expect(resolveListingCreateDailyLimit('USER', 1, 3)).toEqual({
      unlimited: false,
      limit: 4,
    });
    expect(resolveListingCreateDailyLimit('USER', 1, 6)).toEqual({
      unlimited: false,
      limit: 7,
    });
    expect(resolveListingCreateDailyLimit('USER', 1, -5).limit).toBe(1);
    expect(listingDailyLimitMessageAr(1)).toBe(LISTING_DAILY_LIMIT_MESSAGE_AR);
    expect(listingDailyLimitMessageAr(4)).toContain('4');
  });

  it('keeps admin unlimited', () => {
    expect(resolveListingCreateDailyLimit('ADMIN', 1).unlimited).toBe(true);
  });

  it('does not mention upgrading a plan', () => {
    expect(LISTING_DAILY_LIMIT_MESSAGE_AR).not.toContain('ترقية الباقة');
    expect(LISTING_EDIT_LIMIT_MESSAGE_AR).not.toContain('ترقية الباقة');
  });
});
