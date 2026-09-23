// Story constants — lifespan 24h, slide duration bounds

export const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const STORY_MIN_DURATION_SEC = 5;
export const STORY_MAX_DURATION_SEC = 30;
/** Default duration for image stories */
export const STORY_IMAGE_DURATION_SEC = 5;
/** @deprecated use per-story duration from API */
export const STORY_SLIDE_DURATION_SEC = STORY_IMAGE_DURATION_SEC;

export const STORY_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

export function clampStoryDuration(seconds: number): number {
  return Math.min(
    STORY_MAX_DURATION_SEC,
    Math.max(STORY_MIN_DURATION_SEC, Math.round(seconds)),
  );
}

export function storyExpiresAt(from = Date.now()): Date {
  return new Date(from + STORY_LIFETIME_MS);
}

export function storyTimeLeftLabel(expiresAt: string | Date): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'منتهية';
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours} س ${minutes} د متبقية`;
  return `${minutes} د متبقية`;
}
