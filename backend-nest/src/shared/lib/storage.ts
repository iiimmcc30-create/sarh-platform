// Media storage — single active provider selected at runtime (not dual-write).
// Set STORAGE_PROVIDER=local|s3|cloudinary; default: cloudinary → s3 → local (dev).
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v2 as cloudinary } from 'cloudinary';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

export type StorageProvider = 'cloudinary' | 's3' | 'local';
export type UploadFolder =
  | 'avatars'
  | 'listings'
  | 'stories'
  | 'butchers'
  | 'posts'
  | 'temp'
  | 'messages'
  | 'butcher-applications'
  | 'support';

export interface UploadResult {
  key: string;
  url: string;
  cdnUrl: string;
}

export type S3UploadSlot = {
  provider: 's3';
  uploadUrl: string;
  key: string;
  cdnUrl: string;
};

export type CloudinaryUploadSlot = {
  provider: 'cloudinary';
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
};

export type LocalUploadSlot = {
  provider: 'local';
  uploadUrl: string;
  folder: UploadFolder;
};

export type UploadSlot = S3UploadSlot | CloudinaryUploadSlot | LocalUploadSlot;

const BUCKET =
  process.env.AWS_S3_BUCKET || process.env.AWS_BUCKET_NAME || 'safat-uploads';
const CDN_URL = process.env.AWS_CLOUDFRONT_URL || '';
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || '';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || '';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || '';
const CLOUDINARY_BASE_FOLDER = process.env.CLOUDINARY_FOLDER || 'safat';

const s3 =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? new S3Client({
        region: process.env.AWS_REGION || 'me-south-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      })
    : null;

if (CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: process.env.CLOUDINARY_SECURE !== 'false',
  });
}

export function getStorageProvider(): StorageProvider {
  const explicit = process.env.STORAGE_PROVIDER?.toLowerCase();
  const isProd = process.env.NODE_ENV === 'production';

  // Production must never use ephemeral local disk — Render/Railway wipe /uploads.
  if (explicit === 'local' && !isProd) return 'local';
  if (explicit === 'local' && isProd) {
    logger.warn(
      'STORAGE_PROVIDER=local ignored in production; using Cloudinary/S3',
    );
  }

  if (explicit === 's3') return isS3Configured() ? 's3' : fallbackProvider();
  if (explicit === 'cloudinary') {
    return isCloudinaryConfigured() ? 'cloudinary' : fallbackProvider();
  }
  if (isCloudinaryConfigured()) return 'cloudinary';
  if (isS3Configured()) return 's3';
  return fallbackProvider();
}

function fallbackProvider(): StorageProvider {
  if (process.env.NODE_ENV !== 'production') return 'local';
  if (isCloudinaryConfigured()) return 'cloudinary';
  if (isS3Configured()) return 's3';
  // Do not fall back to local disk in production (ephemeral — media 404 / black tiles).
  return 'cloudinary';
}

export function isLocalStorageEnabled(): boolean {
  return getStorageProvider() === 'local';
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
}

export function isS3Configured(): boolean {
  return Boolean(
    s3 && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY,
  );
}

/** Allowed image URL origins for avatar/listing validation */
export function isOurUploadUrl(url: string): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  try {
    const parsed = new URL(url);
    // Cloudinary hostnames vary slightly by account/region
    if (
      CLOUD_NAME &&
      (parsed.hostname === 'res.cloudinary.com' ||
        parsed.hostname.endsWith('.cloudinary.com')) &&
      parsed.pathname.includes(`/${CLOUD_NAME}/`)
    ) {
      return true;
    }

    const allowedOrigins = getAllowedUploadOrigins();
    return allowedOrigins.some((origin) => {
      try {
        const allowed = new URL(origin);
        return (
          parsed.origin === allowed.origin ||
          url.startsWith(origin.replace(/\/$/, ''))
        );
      } catch {
        return url.startsWith(origin);
      }
    });
  } catch {
    return false;
  }
}

export function getAllowedUploadOrigins(): string[] {
  const origins: string[] = [];

  if (CDN_URL) {
    origins.push(
      ...CDN_URL.split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    );
  }

  if (CLOUD_NAME) {
    origins.push(`https://res.cloudinary.com/${CLOUD_NAME}`);
  }

  const region = process.env.AWS_REGION || 'me-south-1';
  origins.push(`https://${BUCKET}.s3.${region}.amazonaws.com`);

  return [...new Set(origins)];
}

function cloudinaryFolder(folder: UploadFolder, userId?: string): string {
  if (folder === 'butcher-applications' || folder === 'support') {
    if (!userId)
      throw new Error(`userId is required for ${folder} uploads`);
    return `${CLOUDINARY_BASE_FOLDER}/${folder}/${userId}`;
  }
  return `${CLOUDINARY_BASE_FOLDER}/${folder}`;
}

function objectKeyPrefix(folder: UploadFolder, userId?: string): string {
  if (folder === 'butcher-applications' || folder === 'support') {
    if (!userId)
      throw new Error(`userId is required for ${folder} uploads`);
    return `${folder}/${userId}`;
  }
  return folder;
}

function getCloudinaryUploadUrl(mimetype?: string): string {
  const resource =
    mimetype?.startsWith('video/') || mimetype?.startsWith('audio/')
      ? 'video'
      : 'image';
  return `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resource}/upload`;
}

function getLocalUploadSlot(folder: UploadFolder): LocalUploadSlot {
  return {
    provider: 'local',
    uploadUrl: '/api/upload/direct',
    folder,
  };
}

async function getCloudinaryUploadSlot(
  folder: UploadFolder,
  userId?: string,
  mimetype?: string,
): Promise<CloudinaryUploadSlot> {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured');
  }

  const timestamp = Math.round(Date.now() / 1000);
  const targetFolder = cloudinaryFolder(folder, userId);
  const publicId = uuidv4();

  const paramsToSign: Record<string, string | number> = {
    timestamp,
    folder: targetFolder,
    public_id: publicId,
  };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    CLOUDINARY_API_SECRET,
  );

  return {
    provider: 'cloudinary',
    uploadUrl: getCloudinaryUploadUrl(mimetype),
    apiKey: CLOUDINARY_API_KEY,
    timestamp,
    signature,
    folder: targetFolder,
    publicId,
  };
}

async function getS3UploadSlot(
  folder: UploadFolder,
  mimetype: string,
  expiresIn = 300,
  userId?: string,
): Promise<S3UploadSlot> {
  if (!s3) throw new Error('S3 is not configured');

  const ext = mimetype.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
  const key = `${objectKeyPrefix(folder, userId)}/${uuidv4()}.${ext}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: mimetype }),
    { expiresIn },
  );

  const cdnUrl = CDN_URL
    ? `${CDN_URL.replace(/\/$/, '')}/${key}`
    : `https://${BUCKET}.s3.${process.env.AWS_REGION || 'me-south-1'}.amazonaws.com/${key}`;

  return { provider: 's3', uploadUrl, key, cdnUrl };
}

export type PresignOptions = {
  userId?: string;
};

export async function getPresignedUploadUrl(
  folder: UploadFolder,
  mimetype: string,
  expiresIn = 300,
  options?: PresignOptions,
): Promise<UploadSlot> {
  const userId = options?.userId;
  if (folder === 'butcher-applications' && !userId) {
    throw new Error('userId is required for butcher-applications uploads');
  }

  const provider = getStorageProvider();

  if (provider === 'local') {
    return getLocalUploadSlot(folder);
  }

  if (provider === 'cloudinary') {
    return getCloudinaryUploadSlot(folder, userId, mimetype);
  }

  return getS3UploadSlot(folder, mimetype, expiresIn, userId);
}

export async function uploadFile(
  buffer: Buffer,
  mimetype: string,
  folder: UploadFolder,
): Promise<UploadResult> {
  const provider = getStorageProvider();

  if (provider === 'cloudinary') {
    if (!isCloudinaryConfigured())
      throw new Error('Cloudinary is not configured');

    const result = await new Promise<{ secure_url: string; public_id: string }>(
      (resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: cloudinaryFolder(folder),
            resource_type: 'image',
          },
          (err, res) => {
            if (err || !res)
              reject(err || new Error('Cloudinary upload failed'));
            else resolve(res as { secure_url: string; public_id: string });
          },
        );
        stream.end(buffer);
      },
    );

    logger.info(
      { publicId: result.public_id, folder },
      'File uploaded to Cloudinary',
    );
    return {
      key: result.public_id,
      url: result.secure_url,
      cdnUrl: result.secure_url,
    };
  }

  if (!s3) throw new Error('S3 is not configured');

  const ext = mimetype.split('/')[1] || 'jpg';
  const key = `${folder}/${uuidv4()}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
      CacheControl: 'max-age=31536000',
    }),
  );

  const url = `https://${BUCKET}.s3.${process.env.AWS_REGION || 'me-south-1'}.amazonaws.com/${key}`;
  const cdnUrl = CDN_URL ? `${CDN_URL.replace(/\/$/, '')}/${key}` : url;

  logger.info({ key, folder }, 'File uploaded to S3');
  return { key, url, cdnUrl };
}

export async function deleteFile(key: string): Promise<void> {
  if (!key) return;

  if (key.startsWith('http') && key.includes('res.cloudinary.com')) {
    if (!isCloudinaryConfigured()) return;
    try {
      const publicId = extractCloudinaryPublicId(key);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
        logger.info({ publicId }, 'Cloudinary file deleted');
      }
    } catch (err) {
      logger.error({ err, key }, 'Cloudinary delete failed');
    }
    return;
  }

  if (!s3) return;

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    logger.info({ key }, 'S3 file deleted');
  } catch (err) {
    logger.error({ err, key }, 'S3 file delete failed');
  }
}

function extractCloudinaryPublicId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
    return match?.[1]?.replace(/^\//, '') ?? null;
  } catch {
    return null;
  }
}

export function getFileUrl(key: string): string {
  if (!key) return '';
  if (key.startsWith('http')) return key;
  if (getStorageProvider() === 'cloudinary' && CLOUD_NAME) {
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${key}`;
  }
  return CDN_URL
    ? `${CDN_URL.replace(/\/$/, '')}/${key}`
    : `https://${BUCKET}.s3.${process.env.AWS_REGION || 'me-south-1'}.amazonaws.com/${key}`;
}

const SIGNED_GET_EXPIRES_SECONDS = 900;

/**
 * Resolves a stored object key to a URL the current provider can serve.
 * Cloudinary keys from butcher-applications are stored without the base folder
 * prefix; this prepends it. S3 uses a short-lived signed GET when possible.
 * Local files are served from /uploads and are not newly made public beyond
 * the existing static mount.
 */
export async function getStoredObjectUrl(
  key: string,
  mimeType?: string | null,
): Promise<string> {
  if (!key) return '';
  if (key.startsWith('http://') || key.startsWith('https://')) return key;

  const normalized = key.replace(/^\/+/, '');
  const provider = getStorageProvider();

  if (provider === 'local') {
    const base = (process.env.APP_URL || 'http://localhost:3001').replace(
      /\/$/,
      '',
    );
    return `${base}/uploads/${normalized}`;
  }

  if (provider === 'cloudinary' && CLOUD_NAME) {
    const resource = mimeType?.startsWith('video/') ? 'video' : 'image';
    const publicId = normalized.startsWith(`${CLOUDINARY_BASE_FOLDER}/`)
      ? normalized
      : `${CLOUDINARY_BASE_FOLDER}/${normalized}`;
    return `https://res.cloudinary.com/${CLOUD_NAME}/${resource}/upload/${publicId}`;
  }

  if (provider === 's3' && s3) {
    try {
      return await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: BUCKET,
          Key: normalized,
          ResponseContentType: mimeType || undefined,
        }),
        { expiresIn: SIGNED_GET_EXPIRES_SECONDS },
      );
    } catch (err) {
      logger.warn({ err, key: normalized }, 'S3 signed GET URL failed');
    }
  }

  return getFileUrl(normalized);
}
