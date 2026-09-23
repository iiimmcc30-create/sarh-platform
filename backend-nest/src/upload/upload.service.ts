import { Injectable } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response } from 'express';
import {
  getPresignedUploadUrl,
  getStorageProvider,
  type CloudinaryUploadSlot,
  type S3UploadSlot,
  type UploadFolder,
  type UploadSlot,
} from '@/lib/storage';
import { APPLICATION_STORAGE_FOLDER } from '@/butcher-applications/constants';
import {
  assertJoinFileAcceptable,
  type JoinFilePart,
} from '@/butcher-applications/helpers/joinFiles';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_SHOP_PHOTO_FILE_BYTES,
} from '@/butcher-applications/constants';
import { STORY_VIDEO_MIME_TYPES } from '@/lib/stories';
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

const ALLOWED_DIRECT_FOLDERS: UploadFolder[] = [
  'avatars',
  'listings',
  'stories',
  'butchers',
  'posts',
  'temp',
  'messages',
];

const MEDIA_FOLDERS = new Set<UploadFolder>([
  'stories',
  'messages',
  'listings',
]);

const IMAGE_MIMES = new Set(IMAGE_MIME_TYPES);
const STORY_VIDEO_MIMES = new Set(STORY_VIDEO_MIME_TYPES);

function butcherApplicationFileKey(
  userId: string,
  slot: UploadSlot,
): string | undefined {
  if (slot.provider === 's3') return slot.key;
  if (slot.provider === 'cloudinary') {
    return `butcher-applications/${userId}/${slot.publicId}`;
  }
  return undefined;
}

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
    folder === 'butcher-applications'
      ? ALLOWED_DOCUMENT_MIME_TYPES
      : folder === 'support'
        ? SUPPORT_MIME_TYPES
        : MEDIA_FOLDERS.has(folder as UploadFolder)
          ? [...IMAGE_MIME_TYPES, ...STORY_VIDEO_MIME_TYPES]
          : IMAGE_MIME_TYPES;

  if (!allowed.includes(mimetype)) {
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

  async presign(user: JwtPayload, dto: PresignUploadDto) {
    validateMimetype(dto.folder, dto.mimetype);

    const count = dto.count ?? 1;
    const presignOptions =
      dto.folder === 'butcher-applications' || dto.folder === 'support'
        ? { userId: user.userId }
        : undefined;

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

      const maxSizeMb =
        dto.folder === 'butcher-applications'
          ? Math.ceil(MAX_SHOP_PHOTO_FILE_BYTES / (1024 * 1024))
          : dto.folder === 'support'
            ? 25
            : dto.mimetype.startsWith('video/')
              ? 50
              : 20;

      const normalizedUrls =
        dto.folder === 'butcher-applications'
          ? urls.map((slot) => {
              const fileKey = butcherApplicationFileKey(user.userId, slot);
              return fileKey ? { ...slot, fileKey } : slot;
            })
          : dto.folder === 'support'
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

  /**
   * Server-side butcher-application upload used by public /join.
   * Reuses the same folder + owned fileKey rules as authenticated presign.
   */
  async uploadOwnedButcherApplicationFile(
    userId: string,
    part: JoinFilePart,
  ): Promise<{
    fileKey: string;
    mimeType: string;
    fileSizeBytes: number;
    originalFileName?: string;
  }> {
    assertJoinFileAcceptable(part);
    const { file } = part;
    const mimeType = file.mimetype;
    const fileSizeBytes = file.size ?? file.buffer?.length ?? 0;
    const originalFileName = file.originalname?.slice(0, 255) || undefined;
    const buffer = await this.readJoinFileBuffer(file);

    await this.enforceUploadRateLimit(userId, 1);

    try {
      const slot = await getPresignedUploadUrl(
        APPLICATION_STORAGE_FOLDER,
        mimeType,
        300,
        { userId },
      );
      const fileKey = await this.putOwnedButcherApplicationBuffer(
        userId,
        buffer,
        mimeType,
        originalFileName,
        slot,
      );
      return { fileKey, mimeType, fileSizeBytes, originalFileName };
    } catch (err) {
      if (err instanceof ApiException) throw err;
      this.logger.error({ userId }, 'Join butcher-application upload failed');
      throwApi(503, 'storage_error', 'فشل رفع المستند');
    }
  }

  private async readJoinFileBuffer(file: Express.Multer.File): Promise<Buffer> {
    if (file.buffer?.length) return file.buffer;
    if (file.path) return fs.promises.readFile(file.path);
    throwApi(400, 'validation_error', 'تعذر قراءة الملف المرفوع');
  }

  private async putOwnedButcherApplicationBuffer(
    userId: string,
    buffer: Buffer,
    mimeType: string,
    originalFileName: string | undefined,
    slot: UploadSlot,
  ): Promise<string> {
    if (slot.provider === 's3') {
      const s3Slot = slot as S3UploadSlot;
      const res = await fetch(s3Slot.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: new Uint8Array(buffer),
      });
      if (!res.ok) throw new Error('s3_put_failed');
      return s3Slot.key;
    }

    if (slot.provider === 'cloudinary') {
      const cloud = slot as CloudinaryUploadSlot;
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(buffer)], { type: mimeType }),
        originalFileName || 'document',
      );
      form.append('api_key', cloud.apiKey);
      form.append('timestamp', String(cloud.timestamp));
      form.append('signature', cloud.signature);
      form.append('folder', cloud.folder);
      form.append('public_id', cloud.publicId);
      const res = await fetch(cloud.uploadUrl, { method: 'POST', body: form });
      if (!res.ok) throw new Error('cloudinary_put_failed');
      const fileKey = butcherApplicationFileKey(userId, cloud);
      if (!fileKey) throw new Error('cloudinary_key_missing');
      return fileKey;
    }

    const ext = mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
    const filename = `${uuidv4()}.${ext}`;
    const destDir = path.join(
      process.cwd(),
      'public',
      'uploads',
      APPLICATION_STORAGE_FOLDER,
      userId,
    );
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, filename), buffer);
    return `${APPLICATION_STORAGE_FOLDER}/${userId}/${filename}`;
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

  private createUploader(folder: UploadFolder) {
    const dest = path.join(process.cwd(), 'public', 'uploads', folder);
    fs.mkdirSync(dest, { recursive: true });
    const maxFileSize = MEDIA_FOLDERS.has(folder)
      ? 50 * 1024 * 1024
      : 20 * 1024 * 1024;
    const allowedMimes: Set<string> = MEDIA_FOLDERS.has(folder)
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
        if (!allowedMimes.has(file.mimetype)) {
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
