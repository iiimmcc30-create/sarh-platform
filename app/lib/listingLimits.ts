export const LISTING_DAILY_LIMIT_MESSAGE_AR =
  'يمكنك نشر إعلان واحد كل 24 ساعة. حاول مرة أخرى بعد انتهاء المدة.';

export const LISTING_EDIT_LIMIT_MESSAGE_AR =
  'يمكنك تعديل الإعلان مرة واحدة فقط.';

export function sanitizeListingLimitMessage(message: string): string {
  const text = message.trim();
  if (!text) return text;
  if (/ترقية الباقة|listing_limit/i.test(text)) {
    return LISTING_DAILY_LIMIT_MESSAGE_AR;
  }
  if (/listing_edit_limit/i.test(text)) {
    return LISTING_EDIT_LIMIT_MESSAGE_AR;
  }
  return text;
}

export function listingAllowsOwnerEdit(
  editCount: number | undefined,
  role?: string | null,
): boolean {
  if (role === 'ADMIN') return true;
  return (editCount ?? 0) < 1;
}

export function listingVideoDurationFromPicker(duration?: number | null): number {
  if (duration == null || Number.isNaN(duration) || duration <= 0) return 0;
  return duration > 1000 ? duration / 1000 : duration;
}

export function listingVideoNeedsTrim(
  durationSecs: number,
  maxDurationSec: number,
): boolean {
  return durationSecs > maxDurationSec;
}
