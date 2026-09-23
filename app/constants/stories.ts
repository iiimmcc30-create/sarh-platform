export const STORY_LIFETIME_HOURS = 24;
export const STORY_MIN_DURATION_SEC = 5;
export const STORY_MAX_DURATION_SEC = 30;
export const STORY_IMAGE_DURATION_SEC = 5;
export const STORY_SLIDE_DURATION_SEC = STORY_IMAGE_DURATION_SEC;

export function clampStoryDuration(seconds: number): number {
  return Math.min(STORY_MAX_DURATION_SEC, Math.max(STORY_MIN_DURATION_SEC, Math.round(seconds)));
}

export function isVideoMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  if (/\.(mp4|mov|webm|m4v|quicktime)(\?|#|$)/i.test(url)) return true;
  if (url.includes('/video/upload/')) return true;
  if (/\/uploads\/stories\//i.test(url) && !/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(url)) {
    return true;
  }
  return false;
}

export function storyPlaybackVideoUrl(story?: {
  mediaUrl?: string | null;
  thumbnail?: string | null;
  duration?: number;
} | null): string | null {
  if (!story?.mediaUrl) return null;
  if (isVideoMediaUrl(story.mediaUrl)) return story.mediaUrl;
  if (
    story.mediaUrl !== story.thumbnail &&
    (story.duration ?? 0) > STORY_IMAGE_DURATION_SEC
  ) {
    return story.mediaUrl;
  }
  return null;
}

export function storyTimeLeftLabel(expiresAt: string | Date): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'منتهية';
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours} س ${minutes} د متبقية`;
  return `${minutes} د متبقية`;
}
