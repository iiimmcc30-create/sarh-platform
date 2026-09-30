export const LISTING_DAILY_LIMIT_MESSAGE_AR =
  'يمكنك نشر إعلان واحد كل 24 ساعة. حاول مرة أخرى بعد انتهاء المدة.';

export const LISTING_EDIT_LIMIT_MESSAGE_AR =
  'يمكنك تعديل الإعلان مرة واحدة فقط.';

export const LISTING_OWNER_EDIT_LIMIT = 1;

/** Base allowance for every regular account (one listing per 24 hours). */
export const LISTING_BASE_DAILY_LIMIT = 1;

/**
 * Daily publish limit. Regular users get the base allowance; an active
 * verification subscription adds its extra daily listings (Blue +3, Gold +6).
 * `_planLimit` (legacy maxAdsPer24Hours) stays ignored on purpose.
 */
export function resolveListingCreateDailyLimit(
  role: string | undefined,
  _planLimit: number,
  extraDailyListings = 0,
): { unlimited: boolean; limit: number } {
  if (role === 'ADMIN') {
    return { unlimited: true, limit: -1 };
  }
  const extra =
    Number.isFinite(extraDailyListings) && extraDailyListings > 0
      ? Math.floor(extraDailyListings)
      : 0;
  return { unlimited: false, limit: LISTING_BASE_DAILY_LIMIT + extra };
}

/** Limit message that matches the account's actual allowance. */
export function listingDailyLimitMessageAr(limit: number): string {
  if (!Number.isFinite(limit) || limit <= LISTING_BASE_DAILY_LIMIT) {
    return LISTING_DAILY_LIMIT_MESSAGE_AR;
  }
  return `وصلت للحد اليومي لنشر الإعلانات (${limit} إعلانات كل 24 ساعة). حاول مرة أخرى بعد انتهاء المدة.`;
}
