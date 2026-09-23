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

  it('keeps butcher plan limits and admin unlimited', () => {
    expect(resolveListingCreateDailyLimit('BUTCHER', -1)).toEqual({
      unlimited: true,
      limit: -1,
    });
    expect(resolveListingCreateDailyLimit('BUTCHER', 5)).toEqual({
      unlimited: false,
      limit: 5,
    });
    expect(resolveListingCreateDailyLimit('ADMIN', 1).unlimited).toBe(true);
  });

  it('does not mention upgrading a plan', () => {
    expect(LISTING_DAILY_LIMIT_MESSAGE_AR).not.toContain('ترقية الباقة');
    expect(LISTING_EDIT_LIMIT_MESSAGE_AR).not.toContain('ترقية الباقة');
  });
});
