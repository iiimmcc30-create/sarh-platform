import { registerDecorator, type ValidationOptions } from 'class-validator';

const MAX_MEDIA_URL_LENGTH = 2048;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const LOCAL_SUFFIX = /(^|\.)(localhost|local|internal|localdomain|home|lan)$/i;
const TLD = /\.[a-z]{2,63}$/i;

/** Strict media URL rules apply in production (NODE_ENV=production). */
export function isStrictMediaUrlMode(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Shape check for a client-supplied media URL (no network, no ownership).
 * Strict (production): https only, default port, no credentials, a public host
 * name with a real TLD — never localhost / *.local / an IP literal. Which host
 * and whose folder is enforced on save by assertUserMediaUrls (media-ownership)
 * or isOurUploadUrl. Development: any http(s) URL, so local disk uploads on
 * localhost keep working.
 */
export function isAcceptableMediaUrl(
  value: unknown,
  strict = isStrictMediaUrlMode(),
): boolean {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!url || url.length > MAX_MEDIA_URL_LENGTH || url !== value) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!strict) {
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== '443') return false;
  const host = parsed.hostname.toLowerCase();
  if (!host || host.startsWith('[') || host.includes(':')) return false; // IPv6
  if (IPV4.test(host) || LOCAL_SUFFIX.test(host)) return false;
  return TLD.test(host);
}

/**
 * DTO decorator for every client-supplied media URL (replaces
 * `@IsUrl({ require_tld: false, protocols: ['http','https'] })`).
 * Pass `{ each: true }` for arrays.
 */
export function IsMediaUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isMediaUrl',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isAcceptableMediaUrl(value);
        },
        defaultMessage() {
          return 'Media URL must be an https link to an upload made from the app';
        },
      },
    });
  };
}

const LISTING_VIDEO_EXT = /\.(mp4|mov|webm|m4v|quicktime)(\?|$)/i;
const LISTING_VIDEO_HINT = /\/video\/|resource_type=video|\/videos\//i;
const LISTING_IMAGE_EXT = /\.(jpe?g|png|webp|gif)(\?|$)/i;

/** Cloudinary derived still from a video — image delivery, not playable video. */
export function isListingVideoStillUrl(url?: string | null): boolean {
  if (typeof url !== 'string') return false;
  const value = url.trim();
  if (!value) return false;
  if (!/\/video\/upload\//i.test(value)) return false;
  if (/\/video\/upload\/[^/]*so_/i.test(value)) return true;
  if (/\/video\/upload\/[^/]*f_jpg/i.test(value)) return true;
  return LISTING_IMAGE_EXT.test(value);
}

export function isListingVideoUrl(url?: string | null): boolean {
  if (typeof url !== 'string') return false;
  const value = url.trim();
  if (!value) return false;
  if (isListingVideoStillUrl(value)) return false;
  return LISTING_VIDEO_EXT.test(value) || LISTING_VIDEO_HINT.test(value);
}

export function extractListingVideoUrl(
  videoUrl?: string | null,
  images?: string[] | null,
): string | null {
  const dedicated = typeof videoUrl === 'string' ? videoUrl.trim() : '';
  if (dedicated && !isListingVideoStillUrl(dedicated)) return dedicated;
  const fromImages = (images ?? []).find((uri) => isListingVideoUrl(uri));
  return fromImages ?? null;
}

/** Render/local disk paths that 404 after every API restart. */
export function isEphemeralDiskUploadUrl(url?: string | null): boolean {
  if (typeof url !== 'string') return false;
  const value = url.trim();
  if (!value) return false;
  if (/res\.cloudinary\.com/i.test(value)) return false;
  return /\/uploads\//i.test(value);
}

type ListingMediaFields = {
  images?: string[] | null;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  seller?: { avatar?: string | null } & Record<string, unknown>;
};

function durableOrNull(url?: string | null): string | null {
  if (!url?.trim()) return url ?? null;
  return isEphemeralDiskUploadUrl(url) ? null : url;
}

/** Strip ephemeral /uploads URLs so clients never receive production 404 media. */
export function sanitizeListingMedia<T extends object>(listing: T): T {
  const row = listing as T & ListingMediaFields;
  const images = (row.images ?? []).filter(
    (uri) =>
      typeof uri === 'string' && uri.trim() && !isEphemeralDiskUploadUrl(uri),
  );
  const thumbnailUrl = durableOrNull(row.thumbnailUrl ?? null);
  const videoUrl = durableOrNull(row.videoUrl ?? null);
  const nextImages =
    images.length > 0 ? images : thumbnailUrl ? [thumbnailUrl] : [];

  const seller = row.seller
    ? {
        ...row.seller,
        avatar: durableOrNull(row.seller.avatar ?? null),
      }
    : row.seller;

  // Belt and braces next to the Prisma global omit: listing coordinates never leave.
  const {
    lat: _lat,
    lng: _lng,
    ...rest
  } = listing as T & { lat?: unknown; lng?: unknown };
  void _lat;
  void _lng;
  return {
    ...(rest as T),
    images: nextImages,
    thumbnailUrl,
    videoUrl,
    ...(seller ? { seller } : {}),
  };
}
