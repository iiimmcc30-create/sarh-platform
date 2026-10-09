/**
 * Server-side checks for media URLs saved on listings, posts, stories and
 * profiles (avatar / cover).
 *
 * A URL is accepted only when it points at OUR storage:
 *  - Cloudinary: our cloud name, public delivery, a public_id under
 *    `<CLOUDINARY_FOLDER>/<avatars|listings|stories|posts|temp>/…`. New uploads
 *    live under `<folder>/<uploaderId>/…`; such a URL must belong to the user
 *    saving it. Legacy uploads (before per-user folders, `<folder>/<uuid>`) are
 *    still accepted unless UPLOAD_REJECT_LEGACY_SHARED_MEDIA=true.
 *    The stored asset is inspected (Upload API `explicit`, not rate-limited):
 *    it must exist, be within UPLOAD_MAX_MB and have an allowed format.
 *  - S3 / CDN (when that provider is active): our bucket / CDN origin only.
 * URLs already attached to the entity being edited are always kept, so edits
 * of old listings never fail. Development (NODE_ENV≠production) is not checked,
 * matching isOurUploadUrl.
 */
import { throwApi } from '../../common/exceptions/api.exception';
import { parseCloudinaryUrl } from '../../messages/lib/message-media';
import {
  destroyCloudinaryAsset,
  getCloudinaryBaseFolder,
  getCloudinaryCloudName,
  getStorageProvider,
  inspectCloudinaryAsset,
  isOurUploadUrl,
  type CloudinaryAssetRef,
} from './storage';
import { BYTES_PER_MB, UPLOAD_MAX_MB } from './upload-limits';
import { logger } from './logger';
import {
  ALLOWED_AUDIO_FORMATS,
  ALLOWED_IMAGE_FORMATS,
  ALLOWED_VIDEO_FORMATS,
} from './upload-formats';

export { allowedFormatsForMime } from './upload-formats';

export const USER_MEDIA_FOLDERS = [
  'avatars',
  'listings',
  'stories',
  'posts',
  'temp',
] as const;
const USER_MEDIA_FOLDER_SET = new Set<string>(USER_MEDIA_FOLDERS);

export type MediaUrlVerdict =
  | {
      ok: true;
      ref?: CloudinaryAssetRef;
      ownedByUser?: boolean;
    }
  | {
      ok: false;
      reason:
        | 'foreign_host'
        | 'foreign_folder'
        | 'not_public'
        | 'other_user'
        | 'legacy_rejected';
    };

const UUIDISH = /^[0-9a-f-]{20,}$/i;

/**
 * Pure URL check (no network). `ownerId` is the user who must own a per-user
 * upload; `allowAnyOwner` is for admin edits.
 */
export function classifyMediaUrl(
  url: string,
  ownerId: string,
  opts: { allowAnyOwner?: boolean } = {},
): MediaUrlVerdict {
  const cloud = getCloudinaryCloudName();
  const ref = parseCloudinaryUrl(url);
  if (ref) {
    if (!cloud || ref.cloudName !== cloud) {
      return { ok: false, reason: 'foreign_host' };
    }
    if (ref.deliveryType !== 'upload') {
      return { ok: false, reason: 'not_public' };
    }
    const base = getCloudinaryBaseFolder();
    // Transformation segments (no version in the URL) may precede the
    // public_id: locate `<base>/<folder>/` inside the path.
    const segs = ref.publicId.split('/');
    const at = segs.findIndex(
      (s, i) => s === base && USER_MEDIA_FOLDER_SET.has(segs[i + 1] ?? ''),
    );
    if (at < 0) return { ok: false, reason: 'foreign_folder' };
    const rest = segs.slice(at + 2);
    const publicId = segs.slice(at).join('/');
    const cleanRef: CloudinaryAssetRef = {
      resourceType: ref.resourceType,
      deliveryType: ref.deliveryType,
      version: ref.version,
      publicId,
      format: ref.format,
    };
    if (rest.length >= 2) {
      const uploader = rest[0];
      if (uploader !== ownerId && !opts.allowAnyOwner) {
        return { ok: false, reason: 'other_user' };
      }
      return { ok: true, ref: cleanRef, ownedByUser: uploader === ownerId };
    }
    if (
      rest.length === 1 &&
      UUIDISH.test(rest[0]) &&
      process.env.UPLOAD_REJECT_LEGACY_SHARED_MEDIA === 'true' &&
      !opts.allowAnyOwner
    ) {
      return { ok: false, reason: 'legacy_rejected' };
    }
    return { ok: true, ref: cleanRef, ownedByUser: false };
  }

  // Not a Cloudinary URL: only our S3 / CDN origins, and never a Cloudinary
  // host we failed to parse.
  if (getStorageProvider() !== 'cloudinary' && isOurUploadUrl(url)) {
    try {
      if (/(^|\.)cloudinary\.com$/i.test(new URL(url).hostname)) {
        return { ok: false, reason: 'foreign_host' };
      }
    } catch {
      return { ok: false, reason: 'foreign_host' };
    }
    return { ok: true };
  }
  return { ok: false, reason: 'foreign_host' };
}

function maxBytesFor(resourceType: string, format?: string): number {
  if (resourceType === 'video') {
    const audioOnly = ['m4a', 'aac', 'mp3', 'ogg', 'opus'].includes(
      (format ?? '').toLowerCase(),
    );
    return (
      (audioOnly ? UPLOAD_MAX_MB.audio : UPLOAD_MAX_MB.video) * BYTES_PER_MB
    );
  }
  return UPLOAD_MAX_MB.image * BYTES_PER_MB;
}

function formatAllowed(resourceType: string, format?: string): boolean {
  if (!format) return true; // Cloudinary did not report one; size still checked
  const f = format.toLowerCase();
  if (resourceType === 'image') {
    return (ALLOWED_IMAGE_FORMATS as readonly string[]).includes(f);
  }
  if (resourceType === 'video') {
    return (
      (ALLOWED_VIDEO_FORMATS as readonly string[]).includes(f) ||
      (ALLOWED_AUDIO_FORMATS as readonly string[]).includes(f)
    );
  }
  return false;
}

export type AssertUserMediaOptions = {
  /** URLs already stored on the entity being edited (always kept). */
  existing?: Iterable<string | null | undefined>;
  /** Admin edits: any uploader's folder is fine (host/folder still checked). */
  allowAnyOwner?: boolean;
};

/**
 * Throws 400 `invalid_media_url` for foreign / other-user URLs, 413 for an
 * oversized asset, 400 for a disallowed format, 503 when Cloudinary cannot be
 * asked. No-op outside production.
 */
export async function assertUserMediaUrls(
  urls: Array<string | null | undefined>,
  ownerId: string,
  opts: AssertUserMediaOptions = {},
): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return;
  const existing = new Set(
    [...(opts.existing ?? [])].filter(
      (u): u is string => typeof u === 'string' && u.length > 0,
    ),
  );
  const fresh = [
    ...new Set(
      urls
        .filter((u): u is string => typeof u === 'string')
        .map((u) => u.trim())
        .filter((u) => u.length > 0 && !existing.has(u)),
    ),
  ];
  if (!fresh.length) return;

  const toInspect: Array<{ ref: CloudinaryAssetRef; ownedByUser: boolean }> =
    [];
  for (const url of fresh) {
    const verdict = classifyMediaUrl(url, ownerId, opts);
    if (!verdict.ok) {
      logger.warn(
        { reason: verdict.reason, ownerId },
        'Rejected media URL (not our upload for this user)',
      );
      throwApi(
        400,
        'invalid_media_url',
        'رابط الوسائط غير صالح. ارفع الصورة أو الفيديو من التطبيق.',
      );
    }
    if (verdict.ref) {
      toInspect.push({
        ref: verdict.ref,
        ownedByUser: verdict.ownedByUser === true,
      });
    }
  }

  const results = await Promise.all(
    toInspect.map(async (item) => {
      try {
        return { item, info: await inspectCloudinaryAsset(item.ref) };
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Media verification failed',
        );
        throwApi(
          503,
          'media_verification_failed',
          'تعذّر التحقق من الملف المرفق، حاول مجدداً',
        );
      }
    }),
  );

  for (const { item, info } of results) {
    if (!info) {
      throwApi(400, 'media_not_found', 'الملف المرفق غير موجود، أعد رفعه');
    }
    const resourceType = info.resourceType ?? item.ref.resourceType;
    const format = info.format ?? item.ref.format;
    const tooBig = info.bytes > maxBytesFor(resourceType, format);
    const badFormat = !formatAllowed(resourceType, format);
    if (!tooBig && !badFormat) continue;
    // Only the uploader's own fresh asset is deleted — never shared/legacy.
    if (item.ownedByUser) {
      await destroyCloudinaryAsset(item.ref).catch((err: unknown) =>
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'Rejected media delete failed',
        ),
      );
    }
    if (tooBig) {
      throwApi(
        413,
        'file_too_large',
        `حجم الملف أكبر من الحد المسموح (الصور ${UPLOAD_MAX_MB.image} ميجابايت، الفيديو ${UPLOAD_MAX_MB.video} ميجابايت).`,
      );
    }
    throwApi(400, 'unsupported_media_format', 'صيغة الملف غير مدعومة');
  }
}
