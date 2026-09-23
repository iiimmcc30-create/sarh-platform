import { Asset } from 'expo-asset';
import {
  STORY_IMAGE_DURATION_SEC,
  STORY_MAX_DURATION_SEC,
  STORY_MIN_DURATION_SEC,
  clampStoryDuration,
} from '@/constants/stories';

export type StoryMediaKind = 'image' | 'video';

/** Lazy-loads expo-video-thumbnails so the route works before a native rebuild. */
export async function getStoryVideoThumbnailUri(
  videoUri: string,
): Promise<string | null> {
  try {
    const VideoThumbnails = await import('expo-video-thumbnails');
    const thumb = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: 0,
      quality: 0.8,
    });
    return thumb.uri;
  } catch {
    return null;
  }
}

async function getFallbackStoryThumbnailUri(): Promise<string> {
  const asset = Asset.fromModule(require('@/assets/images/icon.png'));
  await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

export async function resolveStoryThumbnailUri(
  media: { uri: string; kind: StoryMediaKind },
): Promise<string> {
  if (media.kind === 'image') return media.uri;

  const generated = await getStoryVideoThumbnailUri(media.uri);
  if (generated) return generated;

  return getFallbackStoryThumbnailUri();
}

export function storyDurationFromAsset(durationMs?: number | null): number | null {
  if (durationMs == null || Number.isNaN(durationMs)) return null;
  return clampStoryDuration(durationMs / 1000);
}

export function requiresStoryVideoTrim(seconds: number | null): boolean {
  if (seconds == null) return false;
  return seconds > STORY_MAX_DURATION_SEC;
}

export function validateStoryVideoDuration(seconds: number | null): string | null {
  if (seconds == null) {
    return 'تعذّر قراءة مدة الفيديو. جرّب فيديواً آخر.';
  }
  if (seconds < STORY_MIN_DURATION_SEC) {
    return `مدة الفيديو يجب أن تكون ${STORY_MIN_DURATION_SEC} ثوانٍ على الأقل`;
  }
  if (seconds > STORY_MAX_DURATION_SEC) {
    return `اختر مقطعاً لا يتجاوز ${STORY_MAX_DURATION_SEC} ثانية من الفيديو`;
  }
  return null;
}

export function storyClipEndSec(
  startSec: number,
  totalDurationSec: number,
  maxDurationSec = STORY_MAX_DURATION_SEC,
  minDurationSec = STORY_MIN_DURATION_SEC,
): number {
  const remaining = Math.max(0, totalDurationSec - startSec);
  const clipLength = Math.min(maxDurationSec, remaining);
  return startSec + Math.max(clipLength, minDurationSec);
}

export function storyTrimStartMax(
  totalDurationSec: number,
  minDurationSec = STORY_MIN_DURATION_SEC,
): number {
  return Math.max(0, totalDurationSec - minDurationSec);
}

/** Native trim — lazy-loaded so Metro can register routes before a rebuild. */
export async function trimStoryVideoClip(
  uri: string,
  startSec: number,
  endSec: number,
): Promise<string | null> {
  try {
    const { trimVideo } = await import('expo-trim-video');
    const result = await trimVideo({ uri, start: startSec, end: endSec });
    return result.uri;
  } catch {
    return null;
  }
}

export function storyDurationForKind(kind: StoryMediaKind, durationSec: number | null): number {
  if (kind === 'video') {
    return clampStoryDuration(durationSec ?? STORY_MAX_DURATION_SEC);
  }
  return STORY_IMAGE_DURATION_SEC;
}
