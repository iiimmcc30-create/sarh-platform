import { LISTING_VIDEO_CONFIG } from '../constants/listingVideoConfig';
import {
  LISTING_DAILY_LIMIT_MESSAGE_AR,
  LISTING_EDIT_LIMIT_MESSAGE_AR,
  listingAllowsOwnerEdit,
  listingVideoDurationFromPicker,
  listingVideoNeedsTrim,
  sanitizeListingLimitMessage,
} from '../lib/listingLimits';

describe('listing limits and video trim helpers', () => {
  it('reads picker duration as milliseconds or seconds', () => {
    expect(listingVideoDurationFromPicker(90_000)).toBe(90);
    expect(listingVideoDurationFromPicker(42)).toBe(42);
    expect(listingVideoDurationFromPicker(0)).toBe(0);
  });

  it('requires trim when the clip is longer than the listing max', () => {
    expect(listingVideoNeedsTrim(46, LISTING_VIDEO_CONFIG.MAX_DURATION_S)).toBe(true);
    expect(listingVideoNeedsTrim(45, LISTING_VIDEO_CONFIG.MAX_DURATION_S)).toBe(false);
  });

  it('allows one owner edit and unlimited admin edits', () => {
    expect(listingAllowsOwnerEdit(0, 'USER')).toBe(true);
    expect(listingAllowsOwnerEdit(1, 'USER')).toBe(false);
    expect(listingAllowsOwnerEdit(3, 'ADMIN')).toBe(true);
  });

  it('replaces upgrade-plan copy with the 24-hour rule', () => {
    expect(
      sanitizeListingLimitMessage('وصلت للحد الأقصى (1 إعلانات يومياً). يرجى ترقية الباقة.'),
    ).toBe(LISTING_DAILY_LIMIT_MESSAGE_AR);
    expect(LISTING_DAILY_LIMIT_MESSAGE_AR).not.toContain('ترقية الباقة');
    expect(LISTING_EDIT_LIMIT_MESSAGE_AR).not.toContain('ترقية الباقة');
  });
});
