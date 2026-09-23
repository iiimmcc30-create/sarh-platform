import { apiClient, unwrap, type ApiEnvelope } from './api.client';

export const BUTCHER_UPLOAD_FOLDER = 'butchers' as const;

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const DEFAULT_MAX_IMAGE_MB = 20;

export type UploadFolder = typeof BUTCHER_UPLOAD_FOLDER;

type S3UploadSlot = {
  provider?: 's3';
  uploadUrl: string;
  cdnUrl: string;
};

type CloudinaryUploadSlot = {
  provider: 'cloudinary';
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
};

type LocalUploadSlot = {
  provider: 'local';
  uploadUrl: string;
  folder: string;
};

export type UploadSlot = S3UploadSlot | CloudinaryUploadSlot | LocalUploadSlot;

export function assertImageFile(file: File, maxSizeMb = DEFAULT_MAX_IMAGE_MB): void {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    throw new Error(`نوع الملف غير مدعوم. المسموح: ${ALLOWED_IMAGE_MIME_TYPES.join(', ')}`);
  }
  const maxBytes = maxSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`حجم الصورة يتجاوز ${maxSizeMb} ميجابايت`);
  }
}

function fileExtension(mimetype: string): string {
  return mimetype.split('/')[1] || 'jpg';
}

async function uploadToCloudinary(slot: CloudinaryUploadSlot, file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file, file.name || `upload.${fileExtension(file.type)}`);
  form.append('api_key', slot.apiKey);
  form.append('timestamp', String(slot.timestamp));
  form.append('signature', slot.signature);
  form.append('folder', slot.folder);
  form.append('public_id', slot.publicId);

  const res = await fetch(slot.uploadUrl, { method: 'POST', body: form });
  const json = (await res.json().catch(() => ({}))) as {
    secure_url?: string;
    error?: { message?: string };
  };
  if (!res.ok || !json.secure_url) {
    throw new Error(json.error?.message || 'فشل رفع الصورة');
  }
  return json.secure_url;
}

async function uploadToS3(slot: S3UploadSlot, file: File): Promise<string> {
  const putRes = await fetch(slot.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error('فشل رفع الصورة');
  return slot.cdnUrl;
}

async function uploadToLocal(slot: LocalUploadSlot, file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file, file.name || `upload.${fileExtension(file.type)}`);
  const res = await apiClient.post<ApiEnvelope<{ url: string }>>(
    `/upload/direct?folder=${encodeURIComponent(slot.folder)}`,
    form,
    { headers: { 'Content-Type': undefined as unknown as string } },
  );
  const data = unwrap(res);
  if (!data.url) throw new Error('فشل رفع الصورة');
  return data.url;
}

/** Presign via NestJS (JWT), then upload with the signed slot. Never sends CLOUDINARY_API_SECRET. */
export async function uploadButcherImage(file: File): Promise<string> {
  assertImageFile(file, DEFAULT_MAX_IMAGE_MB);

  const presignRes = await apiClient.post<
    ApiEnvelope<{ urls: UploadSlot[]; maxSizeMb?: number }>
  >('/upload/presign', {
    mimetype: file.type,
    folder: BUTCHER_UPLOAD_FOLDER,
    count: 1,
  });

  const { urls, maxSizeMb = DEFAULT_MAX_IMAGE_MB } = unwrap(presignRes);
  assertImageFile(file, maxSizeMb);

  const slot = urls[0];
  if (!slot?.uploadUrl) {
    throw new Error('تعذّر تجهيز رفع الصورة');
  }

  if (slot.provider === 'local') return uploadToLocal(slot, file);
  if (slot.provider === 'cloudinary' || 'signature' in slot) {
    return uploadToCloudinary(slot as CloudinaryUploadSlot, file);
  }
  if (!('cdnUrl' in slot) || !slot.cdnUrl) {
    throw new Error('تعذّر تجهيز رفع الصورة');
  }
  return uploadToS3(slot, file);
}
