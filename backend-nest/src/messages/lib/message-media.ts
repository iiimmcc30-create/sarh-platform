import type { MessageContentType } from '@prisma/client';
import { UPLOAD_MAX_MB } from '@/lib/upload-limits';
import type { CloudinaryAssetRef } from '@/lib/storage';

export type ParsedCloudinaryUrl = CloudinaryAssetRef & { cloudName: string };

export type MediaMessageKind = Exclude<MessageContentType, 'TEXT'>;

const CLOUDINARY_PATH =
  /^\/([^/]+)\/(image|video|raw)\/(upload|authenticated|private)\/(.+)$/;
const SIGNATURE_SEGMENT = /^s--[A-Za-z0-9_-]{6,}--$/;
const VERSION_SEGMENT = /^v\d+$/;

/**
 * Parses a Cloudinary delivery URL (with or without `s--sig--` / version).
 * Returns null for anything that is not a Cloudinary asset URL.
 */
export function parseCloudinaryUrl(
  url: string | null | undefined,
): ParsedCloudinaryUrl | null {
  if (typeof url !== 'string' || !url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)cloudinary\.com$/i.test(parsed.hostname)) return null;
  const m = CLOUDINARY_PATH.exec(parsed.pathname);
  if (!m) return null;

  let rest = m[4].split('/').filter(Boolean);
  if (rest[0] && SIGNATURE_SEGMENT.test(rest[0])) rest = rest.slice(1);
  let version: string | undefined;
  const vIdx = rest.findIndex((seg) => VERSION_SEGMENT.test(seg));
  if (vIdx >= 0) {
    version = rest[vIdx].slice(1);
    rest = rest.slice(vIdx + 1);
  }
  if (!rest.length) return null;

  let publicId: string;
  try {
    publicId = decodeURIComponent(rest.join('/'));
  } catch {
    return null;
  }
  const resourceType = m[2] as ParsedCloudinaryUrl['resourceType'];
  let format: string | undefined;
  const dot = publicId.lastIndexOf('.');
  if (resourceType !== 'raw' && dot > publicId.lastIndexOf('/')) {
    format = publicId.slice(dot + 1).toLowerCase();
    publicId = publicId.slice(0, dot);
  }
  if (!publicId) return null;

  return {
    cloudName: m[1],
    resourceType,
    deliveryType: m[3] as ParsedCloudinaryUrl['deliveryType'],
    version,
    publicId,
    format,
  };
}

/** Restricted delivery (needs a signed URL) — new protected chat uploads. */
export function isProtectedDelivery(ref: { deliveryType: string }): boolean {
  return ref.deliveryType === 'authenticated' || ref.deliveryType === 'private';
}

/** Canonical, unsigned URL stored in the DB (signatures are added on read). */
export function canonicalCloudinaryUrl(ref: ParsedCloudinaryUrl): string {
  const version = ref.version ? `v${ref.version}/` : '';
  const format = ref.format ? `.${ref.format}` : '';
  return `https://res.cloudinary.com/${ref.cloudName}/${ref.resourceType}/${ref.deliveryType}/${version}${ref.publicId}${format}`;
}

export function isChatMediaPublicId(publicId: string, baseFolder: string) {
  return publicId.startsWith(`${baseFolder}/messages/`);
}

/** Protected uploads live under `<base>/messages/<uploaderId>/`. */
export function isOwnProtectedUpload(
  publicId: string,
  baseFolder: string,
  userId: string,
): boolean {
  return publicId.startsWith(`${baseFolder}/messages/${userId}/`);
}

/** Cloudinary stores audio under the `video` resource type. */
export function expectedResourceType(
  kind: MediaMessageKind,
): 'image' | 'video' {
  return kind === 'IMAGE' ? 'image' : 'video';
}

export function messageMediaMaxMb(kind: MediaMessageKind): number {
  if (kind === 'VIDEO') return UPLOAD_MAX_MB.video;
  if (kind === 'VOICE') return UPLOAD_MAX_MB.audio;
  return UPLOAD_MAX_MB.image;
}

export function mediaTooLargeMessage(kind: MediaMessageKind): string {
  const label =
    kind === 'VIDEO'
      ? 'الفيديو'
      : kind === 'VOICE'
        ? 'الرسالة الصوتية'
        : 'الصورة';
  return `حجم ${label} أكبر من الحد المسموح (${messageMediaMaxMb(kind)} ميجابايت). اختر ملفاً أصغر.`;
}

export const MEDIA_FIELDS = ['imageUrl', 'videoUrl', 'audioUrl'] as const;
export type MediaField = (typeof MEDIA_FIELDS)[number];

type MediaFields = Partial<Record<MediaField, string | null>>;

/**
 * Media URLs that are safe to put in push payloads / notification rows:
 * protected chat media is never copied outside the thread.
 */
export function publicMediaForPush(payload: MediaFields): {
  imageUrl?: string;
  videoUrl?: string;
} {
  const out: { imageUrl?: string; videoUrl?: string } = {};
  for (const field of ['imageUrl', 'videoUrl'] as const) {
    const url = payload[field];
    if (!url) continue;
    const ref = parseCloudinaryUrl(url);
    if (ref && isProtectedDelivery(ref)) continue;
    out[field] = url;
  }
  return out;
}
