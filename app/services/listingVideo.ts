/**
 * Listing video — upload + validation.
 * Completely independent from the image upload system.
 */
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Platform } from 'react-native';
import { LISTING_VIDEO_CONFIG } from '@/constants/listingVideoConfig';
import { cloudinaryVideoFirstFrameUrl } from '@/lib/listingMedia';
import { uploadImageFromUri, uploadMediaFromUri } from './upload';

export type ListingVideoMeta = {
  localUri: string;
  thumbnailUri: string | null;
  durationSecs: number;
  width: number;
  height: number;
  fileSizeBytes: number;
};

export type ListingVideoUploadResult = {
  videoUrl: string;
  thumbnailUrl: string | null;
  videoDuration: number;
  videoWidth: number;
  videoHeight: number;
  videoFileSize: number;
};

export type ListingVideoValidationError =
  | 'duration_exceeded'
  | 'file_too_large'
  | 'unknown';

export function validateListingVideo(
  durationSecs: number | null | undefined,
  fileSizeBytes: number | null | undefined,
): ListingVideoValidationError | null {
  if (
    durationSecs != null &&
    durationSecs > LISTING_VIDEO_CONFIG.MAX_DURATION_S
  ) {
    return 'duration_exceeded';
  }
  if (
    fileSizeBytes != null &&
    fileSizeBytes > LISTING_VIDEO_CONFIG.MAX_FILE_BYTES
  ) {
    return 'file_too_large';
  }
  return null;
}

export function listingVideoValidationMessage(
  err: ListingVideoValidationError,
): string {
  switch (err) {
    case 'duration_exceeded':
      return `مدة الفيديو يجب ألا تتجاوز ${LISTING_VIDEO_CONFIG.MAX_DURATION_S} ثانية.`;
    case 'file_too_large':
      return `حجم الفيديو يجب ألا يتجاوز ${LISTING_VIDEO_CONFIG.MAX_FILE_MB} ميجابايت.`;
    default:
      return 'فيديو غير صالح. حاول مرة أخرى.';
  }
}

/** Generate a thumbnail from the video's first frame. Returns null on failure (non-blocking). */
export async function generateVideoThumbnail(
  videoUri: string,
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: 0,
      quality: 0.75,
    });
    return uri;
  } catch {
    return null;
  }
}

type UploadProgressCallback = (progress: number) => void;

/**
 * Upload video + thumbnail for a listing.
 * Does NOT modify the image upload flow.
 */
export async function uploadListingVideo(
  accessToken: string,
  meta: ListingVideoMeta,
  onProgress?: UploadProgressCallback,
): Promise<ListingVideoUploadResult> {
  onProgress?.(0);

  const videoUrl = await uploadMediaFromUri(
    accessToken,
    meta.localUri,
    'listings',
    'video',
  );

  onProgress?.(meta.thumbnailUri ? 70 : 100);

  let thumbnailUrl: string | null = null;
  if (meta.thumbnailUri) {
    try {
      thumbnailUrl = await uploadImageFromUri(
        accessToken,
        meta.thumbnailUri,
        'listings',
      );
    } catch {
      // Thumbnail failure is non-fatal — fall back to Cloudinary still
    }
  }
  if (!thumbnailUrl) {
    thumbnailUrl = cloudinaryVideoFirstFrameUrl(videoUrl) ?? null;
  }

  onProgress?.(100);

  return {
    videoUrl,
    thumbnailUrl,
    videoDuration: meta.durationSecs,
    videoWidth: meta.width,
    videoHeight: meta.height,
    videoFileSize: meta.fileSizeBytes,
  };
}
