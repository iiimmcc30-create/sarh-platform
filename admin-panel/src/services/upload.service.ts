import { apiClient, unwrap, type ApiEnvelope } from './api.client';

type UploadFolder = 'posts' | 'stories' | 'temp' | 'listings';

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
  folder: UploadFolder;
};

type UploadSlot = S3UploadSlot | CloudinaryUploadSlot | LocalUploadSlot;

function fileExtension(mimetype: string): string {
  return mimetype.split('/')[1] || 'jpg';
}

async function uploadToCloudinary(
  slot: CloudinaryUploadSlot,
  file: File,
): Promise<string> {
  const form = new FormData();
  const ext = fileExtension(file.type);

  form.append('file', file, file.name || `upload.${ext}`);
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

  if (!putRes.ok) {
    throw new Error('فشل رفع الصورة');
  }

  return slot.cdnUrl;
}

async function uploadToLocal(slot: LocalUploadSlot, file: File): Promise<string> {
  const form = new FormData();
  const ext = fileExtension(file.type);
  form.append('file', file, file.name || `upload.${ext}`);

  const res = await apiClient.post<ApiEnvelope<{ url: string }>>(
    `/upload/direct?folder=${encodeURIComponent(slot.folder)}`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );

  const data = unwrap(res);
  if (!data.url) throw new Error('فشل رفع الصورة');
  return data.url;
}

/** Upload any image from a file picker, presigned to a given folder. */
export async function uploadImageToFolder(
  file: File,
  folder: UploadFolder,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('اختر ملف صورة فقط');
  }

  const presignRes = await apiClient.post<
    ApiEnvelope<{ urls: UploadSlot[]; maxSizeMb?: number }>
  >('/upload/presign', {
    mimetype: file.type,
    folder,
    count: 1,
  });

  const { urls, maxSizeMb = 20 } = unwrap(presignRes);
  const slot = urls[0];
  if (!slot?.uploadUrl) {
    throw new Error('تعذّر تجهيز رفع الصورة');
  }

  const maxBytes = maxSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`حجم الصورة يتجاوز ${maxSizeMb} ميجابايت`);
  }

  if (slot.provider === 'local') return uploadToLocal(slot, file);
  if (slot.provider === 'cloudinary' || 'signature' in slot) {
    return uploadToCloudinary(slot as CloudinaryUploadSlot, file);
  }
  if (!slot.cdnUrl) throw new Error('تعذّر تجهيز رفع الصورة');
  return uploadToS3(slot, file);
}

/** Upload the Knowledge Center account avatar. */
export async function uploadKnowledgeCenterAvatar(file: File): Promise<string> {
  return uploadImageToFolder(file, 'posts');
}

/** Upload an image from the device album/file picker for editorial stories. */
export async function uploadEditorialStoryImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('اختر ملف صورة فقط');
  }

  const presignRes = await apiClient.post<
    ApiEnvelope<{ urls: UploadSlot[]; maxSizeMb?: number }>
  >('/upload/presign', {
    mimetype: file.type,
    folder: 'stories',
    count: 1,
  });

  const { urls, maxSizeMb = 20 } = unwrap(presignRes);
  const slot = urls[0];
  if (!slot?.uploadUrl) {
    throw new Error('تعذّر تجهيز رفع الصورة');
  }

  const maxBytes = maxSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`حجم الصورة يتجاوز ${maxSizeMb} ميجابايت`);
  }

  if (slot.provider === 'local') {
    return uploadToLocal(slot, file);
  }
  if (slot.provider === 'cloudinary' || 'signature' in slot) {
    return uploadToCloudinary(slot as CloudinaryUploadSlot, file);
  }
  if (!slot.cdnUrl) {
    throw new Error('تعذّر تجهيز رفع الصورة');
  }
  return uploadToS3(slot, file);
}

/** Listing image or video via the existing presign/Cloudinary path. */
export async function uploadListingMedia(file: File): Promise<string> {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) {
    throw new Error('اختر صورة أو فيديو');
  }

  const presignRes = await apiClient.post<
    ApiEnvelope<{ urls: UploadSlot[]; maxSizeMb?: number }>
  >('/upload/presign', {
    mimetype: file.type,
    folder: 'listings',
    count: 1,
  });

  const { urls, maxSizeMb = 20 } = unwrap(presignRes);
  const slot = urls[0];
  if (!slot?.uploadUrl) {
    throw new Error('تعذّر تجهيز الرفع');
  }

  const maxBytes = maxSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`حجم الملف يتجاوز ${maxSizeMb} ميجابايت`);
  }

  if (slot.provider === 'local') return uploadToLocal(slot, file);
  if (slot.provider === 'cloudinary' || 'signature' in slot) {
    return uploadToCloudinary(slot as CloudinaryUploadSlot, file);
  }
  if (!slot.cdnUrl) throw new Error('تعذّر تجهيز الرفع');
  return uploadToS3(slot, file);
}
