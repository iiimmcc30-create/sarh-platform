import { Injectable } from '@nestjs/common';
import {
  destroyCloudinaryAsset,
  deleteS3Object,
  getCloudinaryBaseFolder,
  getCloudinaryCloudName,
  getStorageProvider,
  inspectCloudinaryAsset,
  isOurUploadUrl,
  localUploadSizeBytes,
  s3KeyFromUrl,
  s3ObjectSizeBytes,
  signedCloudinaryDeliveryUrl,
} from '@/lib/storage';
import { BYTES_PER_MB } from '@/lib/upload-limits';
import { ApiException, throwApi } from '../../common/exceptions/api.exception';
import { LoggerService } from '../../common/services/logger.service';
import type { ResolvedMessagePayload } from '../lib/message-payload';
import {
  MEDIA_FIELDS,
  type MediaField,
  type MediaMessageKind,
  canonicalCloudinaryUrl,
  expectedResourceType,
  isChatMediaPublicId,
  isOwnProtectedUpload,
  isProtectedDelivery,
  mediaTooLargeMessage,
  messageMediaMaxMb,
  parseCloudinaryUrl,
} from '../lib/message-media';

type WithMedia = {
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
};

/**
 * Chat media guard shared by REST and socket sends:
 * - verifies the real stored size of the referenced upload before a message
 *   is accepted (Cloudinary presigned uploads cannot enforce a size limit),
 *   deleting oversized chat uploads;
 * - protected (Cloudinary `authenticated`) uploads must belong to the sender;
 * - on read, protected media URLs are signed for thread participants only.
 * Legacy public media (old messages / old app builds) is returned unchanged.
 */
@Injectable()
export class MessageMediaService {
  constructor(private readonly logger: LoggerService) {}

  async verifyForSend(
    senderId: string,
    payload: ResolvedMessagePayload,
  ): Promise<ResolvedMessagePayload> {
    const field = MEDIA_FIELDS.find((f) => Boolean(payload[f]));
    if (!field || payload.type === 'TEXT') return payload;
    const url = payload[field] as string;
    const kind = payload.type;
    const maxBytes = messageMediaMaxMb(kind) * BYTES_PER_MB;
    const provider = getStorageProvider();

    const ref = parseCloudinaryUrl(url);
    const ourCloud = getCloudinaryCloudName();
    if (ref && ourCloud && ref.cloudName === ourCloud) {
      const base = getCloudinaryBaseFolder();
      if (
        isProtectedDelivery(ref) &&
        !isOwnProtectedUpload(ref.publicId, base, senderId)
      ) {
        throwApi(403, 'forbidden_media', 'لا يمكن إرفاق ملف لم تقم برفعه');
      }
      if (ref.resourceType !== expectedResourceType(kind)) {
        throwApi(400, 'invalid_message', 'نوع الملف لا يطابق نوع الرسالة');
      }
      let info: Awaited<ReturnType<typeof inspectCloudinaryAsset>>;
      try {
        info = await inspectCloudinaryAsset(ref);
      } catch (err) {
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err), field },
          'Message media verification failed',
        );
        throwApi(
          503,
          'media_verification_failed',
          'تعذّر التحقق من الملف المرفق، حاول مجدداً',
        );
      }
      if (!info) {
        throwApi(400, 'media_not_found', 'الملف المرفق غير موجود، أعد رفعه');
      }
      if (info.bytes > maxBytes) {
        // Only chat uploads are deleted — never listing/story assets.
        if (isChatMediaPublicId(ref.publicId, base)) {
          await destroyCloudinaryAsset(ref).catch((err: unknown) =>
            this.logger.warn(
              { err: err instanceof Error ? err.message : String(err) },
              'Oversized message media delete failed',
            ),
          );
        }
        throwApi(413, 'file_too_large', mediaTooLargeMessage(kind));
      }
      const stored = isProtectedDelivery(ref)
        ? canonicalCloudinaryUrl({
            ...ref,
            version: info.version ?? ref.version,
            format: ref.format ?? info.format,
          })
        : url;
      return { ...payload, [field]: stored, mediaSizeBytes: info.bytes };
    }

    if (provider === 'local') {
      const size = localUploadSizeBytes(url);
      if (size != null && size > maxBytes) {
        throwApi(413, 'file_too_large', mediaTooLargeMessage(kind));
      }
      return size != null ? { ...payload, mediaSizeBytes: size } : payload;
    }

    if (provider === 's3') {
      const key = s3KeyFromUrl(url);
      if (key) {
        return this.verifyS3(payload, field, kind, key, maxBytes);
      }
    }

    if (!isOurUploadUrl(url)) {
      throwApi(400, 'invalid_media_url', 'رابط الوسائط غير صالح');
    }
    return payload;
  }

  private async verifyS3(
    payload: ResolvedMessagePayload,
    field: MediaField,
    kind: MediaMessageKind,
    key: string,
    maxBytes: number,
  ): Promise<ResolvedMessagePayload> {
    let size: number | null;
    try {
      size = await s3ObjectSizeBytes(key);
    } catch (err) {
      if (err instanceof ApiException) throw err;
      throwApi(
        503,
        'media_verification_failed',
        'تعذّر التحقق من الملف المرفق، حاول مجدداً',
      );
    }
    if (size == null) {
      throwApi(400, 'media_not_found', 'الملف المرفق غير موجود، أعد رفعه');
    }
    if (size > maxBytes) {
      if (key.startsWith('messages/')) {
        await deleteS3Object(key).catch(() => undefined);
      }
      throwApi(413, 'file_too_large', mediaTooLargeMessage(kind));
    }
    return { ...payload, [field]: payload[field], mediaSizeBytes: size };
  }

  /** Signed, participant-only URL for protected media; legacy URLs unchanged. */
  presentUrl(url: string | null | undefined): string | null | undefined {
    if (!url) return url;
    const ref = parseCloudinaryUrl(url);
    if (!ref || !isProtectedDelivery(ref)) return url;
    const ourCloud = getCloudinaryCloudName();
    if (!ourCloud || ref.cloudName !== ourCloud) return url;
    try {
      return signedCloudinaryDeliveryUrl(ref);
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Signing message media URL failed',
      );
      return url;
    }
  }

  presentMessage<T extends WithMedia>(message: T): T {
    if (!message) return message;
    let changed = false;
    const out = { ...message };
    for (const field of MEDIA_FIELDS) {
      const value = message[field];
      if (!value) continue;
      const signed = this.presentUrl(value);
      if (signed !== value) {
        (out as WithMedia)[field] = signed;
        changed = true;
      }
    }
    return changed ? out : message;
  }

  presentMessages<T extends WithMedia>(messages: T[]): T[] {
    return messages.map((m) => this.presentMessage(m));
  }
}
