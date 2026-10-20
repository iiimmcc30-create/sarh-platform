import { Image } from 'react-native';

/** Longest edge of a photo before it is uploaded (listings, chat, posts, stories). */
export const UPLOAD_IMAGE_MAX_EDGE = 1600;
/** JPEG quality after the resize. The picker quality is only a first pass. */
export const UPLOAD_IMAGE_COMPRESS = 0.72;

export type ResizeAction = { width: number } | { height: number };

/**
 * Downscale so the long edge is at most `maxEdge`. Returns null when the
 * image is already small enough, or when dimensions are unknown (never upscale).
 */
export function planImageResize(
  width?: number,
  height?: number,
  maxEdge = UPLOAD_IMAGE_MAX_EDGE,
): ResizeAction | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  if (Math.max(width, height) <= maxEdge) return null;
  if (width >= height) return { width: maxEdge };
  return { height: maxEdge };
}

function imageSize(uri: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(null),
    );
  });
}

/**
 * Resize to ~1600px and re-encode as JPEG before upload.
 * Returns the original URI when the manipulator is unavailable or the file
 * is not a still image we can safely re-encode.
 */
export async function prepareUploadImage(uri: string): Promise<string> {
  const value = uri?.trim();
  if (!value) return uri;
  try {
    const manipulator = await import('expo-image-manipulator');
    const size = await imageSize(value);
    const resize = planImageResize(size?.width, size?.height);
    const actions = resize ? [{ resize }] : [];
    const result = await manipulator.manipulateAsync(value, actions, {
      compress: UPLOAD_IMAGE_COMPRESS,
      format: manipulator.SaveFormat.JPEG,
    });
    return result?.uri || value;
  } catch {
    return value;
  }
}
