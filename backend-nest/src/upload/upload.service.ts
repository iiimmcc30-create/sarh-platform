import { Injectable } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';
import {
  getPresignedUploadUrl,
  getStorageProvider,
  type UploadFolder,
  type UploadSlot,
} from '@/lib/storage';
import { STORY_VIDEO_MIME_TYPES } from '@/lib/stories';
import { UPLOAD_MAX_MB } from '@/lib/upload-limits';
import { ApiException, throwApi } from '../common/exceptions/api.exception';
import { LoggerService } from '../common/services/logger.service';
import { RedisSessionService } from '../redis/services/redis-session.service';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { PresignUploadDto } from './dto/upload.dto';
import { mimeMatchesMagic } from './file-magic';

const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;
const MAX_UPLOADS_PER_HOUR = 30;

/**
 * Voice-note formats accepted in the `messages` folder only.
 * Web records webm/opus (Chrome/Firefox) or mp4/aac (Safari); native records m4a/AAC.
 */
export const MESSAGE_AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/mpeg',
] as const;
const MESSAGE_AUDIO_MIMES = new Set<string>(MESSAGE_AUDIO_MIME_TYPES);

/** Size limits (MB) returned to clients and enforced for direct uploads. */
export { UPLOAD_MAX_MB };

/** Strip codec parameters: `audio/webm;codecs=opus` -> `audio/webm`. */
export function normalizeUploadMime(mimetype: string): string {
  return (mimetype || '').split(';')[0].trim().toLowerCase();
}

export function maxUploadSizeMb(
  folder: PresignUploadDto['folder'],
  mimetype: string,
): number {
  if (folder === 'support') return UPLOAD_MAX_MB.support;
  const mime = normalizeUploadMime(mimetype);
  if (mime.startsWith('video/')) return UPLOAD_MAX_MB.video;
  if (mime.startsWith('audio/')) return UPLOAD_MAX_MB.audio;
  return UPLOAD_MAX_MB.image;
}

/** Documents accepted for support attachments. */
const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

const ALLOWED_DIRECT_FOLDERS: UploadFolder[] = [
  'avatars',
  'listings',
  'stories',
  'posts',
  'temp',
  'messages',
];

const MEDIA_FOLDERS = new Set<UploadFolder>([
  'stories',
  'messages',
  'listings',
  'posts',
]);

const IMAGE_MIMES = new Set(IMAGE_MIME_TYPES);
const STORY_VIDEO_MIMES = new Set(STORY_VIDEO_MIME_TYPES);

const SUPPORT_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  ...STORY_VIDEO_MIME_TYPES,
  ...ALLOWED_DOCUMENT_MIME_TYPES,
] as const;

function supportFileKey(userId: string, slot: UploadSlot): string | undefined {
  if (slot.provider === 's3') return slot.key;
  if (slot.provider === 'cloudinary') {
    return `support/${userId}/${slot.publicId}`;
  }
  return undefined;
}

function validateMimetype(
  folder: PresignUploadDto['folder'],
  mimetype: string,
): void {
  const allowed: readonly string[] =
    folder === 'support'
      ? SUPPORT_MIME_TYPES
      : folder === 'messages'
        ? [
            ...IMAGE_MIME_TYPES,
            ...STORY_VIDEO_MIME_TYPES,
            ...MESSAGE_AUDIO_MIME_TYPES,
          ]
        : MEDIA_FOLDERS.has(folder as UploadFolder)
          ? [...IMAGE_MIME_TYPES, ...STORY_VIDEO_MIME_TYPES]
          : IMAGE_MIME_TYPES;

  if (!allowed.includes(normalizeUploadMime(mimetype))) {
    throwApi(
      400,
      'validation_error',
      `نوع الملف غير مدعوم. المسموح: ${allowed.join(', ')}`,
    );
  }
}

@Injectable()
export class UploadService {
  constructor(
    private readonly sessions: RedisSessionService,
    private readonly logger: LoggerService,
  ) {}

  private async enforceUploadRateLimit(
    userId: string,
    count: number,
  ): Promise<void> {
    if (!this.sessions.isEnabled()) return;

    try {
      const redis = this.sessions.getClient();
      const userUploadKey = `upload_count:${userId}`;
      const currentCount = parseInt(
        (await redis.get(userUploadKey)) || '0',
        10,
      );

      if (currentCount + count > MAX_UPLOADS_PER_HOUR) {
        throwApi(
          429,
          'upload_limit',
          `حد الرفع: ${MAX_UPLOADS_PER_HOUR} ملف في الساعة`,
        );
      }

      const pipe = redis.pipeline();
      pipe.incrby(userUploadKey, count);
      pipe.expire(userUploadKey, 3600);
      await pipe.exec();
    } catch (err) {
      if (err instanceof ApiException) throw err;
      if (process.env.NODE_ENV === 'production') {
        throwApi(503, 'storage_error', 'خطأ مؤقت في خدمة التخزين');
      }
    }
  }

  async presign(user: JwtPayload, rawDto: PresignUploadDto) {
    validateMimetype(rawDto.folder, rawDto.mimetype);
    const dto = { ...rawDto, mimetype: normalizeUploadMime(rawDto.mimetype) };

    const count = dto.count ?? 1;
    const signFormats = dto.formats === 'signed';
    if (
      !signFormats &&
      process.env.UPLOAD_REQUIRE_SIGNED_FORMATS === 'true' &&
      getStorageProvider() === 'cloudinary'
    ) {
      throwApi(426, 'app_update_required', 'حدّث التطبيق لرفع الصور والفيديو.');
    }
    // Every slot carries the uploader: public media goes to a per-user folder
    // (ownership is checked when the URL is saved) and new builds get a signed
    // `allowed_formats`.
    const presignOptions =
      dto.folder === 'messages' && dto.delivery === 'authenticated'
        ? { userId: user.userId, protectedDelivery: true, signFormats }
        : { userId: user.userId, signFormats };

    await this.enforceUploadRateLimit(user.userId, count);

    try {
      const urls = await Promise.all(
        Array.from({ length: count }, () =>
          getPresignedUploadUrl(
            dto.folder as UploadFolder,
            dto.mimetype,
            300,
            presignOptions,
          ),
        ),
      );

      const maxSizeMb = maxUploadSizeMb(dto.folder, dto.mimetype);

      const normalizedUrls =
        dto.folder === 'support'
          ? urls.map((slot) => {
              const fileKey = supportFileKey(user.userId, slot);
              return fileKey ? { ...slot, fileKey } : slot;
            })
          : urls;

      return {
        provider: getStorageProvider(),
        urls: normalizedUrls,
        maxSizeMb,
      };
    } catch (err) {
      const message =
        err instanceof Error && err.message.includes('Cloudinary')
          ? 'Cloudinary غير مُعدّ. أضف CLOUDINARY_* في backend/.env'
          : 'خطأ في خدمة التخزين';
      throwApi(503, 'storage_error', message);
    }
  }

  assertDirectUploadAvailable(): void {
    if (getStorageProvider() !== 'local') {
      throwApi(
        404,
        'not_available',
        'الرفع المباشر متاح في وضع التطوير المحلي فقط',
      );
    }
  }

  async uploadDirect(
    user: JwtPayload,
    folderParam: string,
    req: Request,
    res: Response,
  ): Promise<{ url: string; key: string }> {
    if (!ALLOWED_DIRECT_FOLDERS.includes(folderParam as UploadFolder)) {
      throwApi(400, 'validation_error', 'مجلد الرفع غير صالح');
    }

    const folder = folderParam as UploadFolder;

    try {
      const file = await this.runMulterUpload(folder, req, res);
      if (!file) {
        throwApi(400, 'no_file', 'لم يُرسل أي ملف');
      }

      this.assertUploadedFileMagic(file);
      this.assertUploadedFileSize(folder, file);

      const host = req.headers.host;
      const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
      const base = host
        ? `${proto}://${host}`.replace(/\/$/, '')
        : (process.env.APP_URL || 'http://localhost:3001').replace(/\/$/, '');
      const publicPath = `/uploads/${folder}/${file.filename}`;
      const url = `${base}${publicPath}`;

      this.logger.info(
        { folder, filename: file.filename, userId: user.userId },
        'Local file uploaded',
      );

      return { url, key: publicPath };
    } catch (err) {
      if (err instanceof ApiException) throw err;
      this.logger.error({ err }, 'Local upload failed');
      throwApi(500, 'upload_failed', 'فشل رفع الملف');
    }
  }

  /**
   * Defense-in-depth for local/direct uploads: reject files whose magic bytes
   * do not match the declared MIME (MIME spoofing). Cloudinary/S3 presign
   * paths rely on the provider; production uses STORAGE_PROVIDER=cloudinary.
   */
  private assertUploadedFileMagic(file: Express.Multer.File): void {
    const pathOnDisk = file.path;
    if (!pathOnDisk) return;
    let header: Buffer;
    try {
      const fd = fs.openSync(pathOnDisk, 'r');
      try {
        header = Buffer.alloc(32);
        const bytesRead = fs.readSync(fd, header, 0, 32, 0);
        header = header.subarray(0, bytesRead);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      try {
        fs.unlinkSync(pathOnDisk);
      } catch {
        /* ignore */
      }
      throwApi(400, 'validation_error', 'تعذر قراءة الملف المرفوع');
      return;
    }

    if (!mimeMatchesMagic(file.mimetype, header)) {
      try {
        fs.unlinkSync(pathOnDisk);
      } catch {
        /* ignore */
      }
      throwApi(400, 'validation_error', 'محتوى الملف لا يطابق نوعه المعلن');
    }
  }

  /** Per-kind size cap (e.g. voice notes 10 MB) on top of multer's folder cap. */
  private assertUploadedFileSize(
    folder: UploadFolder,
    file: Express.Multer.File,
  ): void {
    const maxBytes = maxUploadSizeMb(folder, file.mimetype) * 1024 * 1024;
    if (typeof file.size === 'number' && file.size > maxBytes) {
      if (file.path) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          /* ignore */
        }
      }
      throwApi(
        413,
        'file_too_large',
        `حجم الملف أكبر من الحد المسموح (${maxUploadSizeMb(folder, file.mimetype)} ميجابايت)`,
      );
    }
  }

  private createUploader(folder: UploadFolder) {
    const dest = path.join(process.cwd(), 'public', 'uploads', folder);
    fs.mkdirSync(dest, { recursive: true });
    const maxFileSize = MEDIA_FOLDERS.has(folder)
      ? UPLOAD_MAX_MB.video * 1024 * 1024
      : UPLOAD_MAX_MB.image * 1024 * 1024;
    const allowedMimes: Set<string> =
      folder === 'messages'
        ? new Set([
            ...IMAGE_MIMES,
            ...STORY_VIDEO_MIMES,
            ...MESSAGE_AUDIO_MIMES,
          ])
        : MEDIA_FOLDERS.has(folder)
          ? new Set([...IMAGE_MIMES, ...STORY_VIDEO_MIMES])
          : IMAGE_MIMES;

    return multer({
      storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, dest),
        filename: (_req, file, cb) => {
          const ext =
            file.mimetype.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
          cb(null, `${uuidv4()}.${ext}`);
        },
      }),
      limits: { fileSize: maxFileSize },
      fileFilter: (_req, file, cb) => {
        if (!allowedMimes.has(normalizeUploadMime(file.mimetype))) {
          cb(new Error('نوع الملف غير مدعوم'));
          return;
        }
        cb(null, true);
      },
    }).single('file');
  }

  private runMulterUpload(
    folder: UploadFolder,
    req: Request,
    res: Response,
  ): Promise<Express.Multer.File | undefined> {
    const upload = this.createUploader(folder);
    return new Promise((resolve, reject) => {
      upload(req, res, (err: unknown) => {
        if (err) reject(err);
        else resolve((req as Request & { file?: Express.Multer.File }).file);
      });
    });
  }
}
