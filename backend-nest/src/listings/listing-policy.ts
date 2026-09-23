export const LISTING_DAILY_LIMIT_MESSAGE_AR =
  'يمكنك نشر إعلان واحد كل 24 ساعة. حاول مرة أخرى بعد انتهاء المدة.';

export const LISTING_EDIT_LIMIT_MESSAGE_AR =
  'يمكنك تعديل الإعلان مرة واحدة فقط.';

export const LISTING_OWNER_EDIT_LIMIT = 1;

export function resolveListingCreateDailyLimit(
  role: string | undefined,
  planLimit: number,
): { unlimited: boolean; limit: number } {
  if (role === 'ADMIN') {
    return { unlimited: true, limit: -1 };
  }
  if (role !== 'BUTCHER') {
    return { unlimited: false, limit: 1 };
  }
  if (planLimit < 0) {
    return { unlimited: true, limit: planLimit };
  }
  return { unlimited: false, limit: planLimit };
}
