/** Upload formats accepted for user media (shared by signing + checks). */

/** Formats Cloudinary may report for what the app uploads. */
export const ALLOWED_IMAGE_FORMATS = [
  'avif',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'heic',
  'heif',
] as const;
export const ALLOWED_VIDEO_FORMATS = ['mp4', 'mov', 'webm', 'm4v'] as const;
export const ALLOWED_AUDIO_FORMATS = [
  'webm',
  'ogg',
  'opus',
  'm4a',
  'mp4',
  'aac',
  'mp3',
] as const;

/** Value for Cloudinary's signed `allowed_formats` upload parameter. */
export function allowedFormatsForMime(mimetype: string): string {
  const mime = (mimetype || '').split(';')[0].trim().toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('video/')) return ALLOWED_VIDEO_FORMATS.join(',');
  if (mime.startsWith('audio/')) return ALLOWED_AUDIO_FORMATS.join(',');
  return ALLOWED_IMAGE_FORMATS.join(',');
}
