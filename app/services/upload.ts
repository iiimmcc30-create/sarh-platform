// services/upload.ts — رفع صورة عبر presign (Cloudinary أو S3)

import { Platform } from 'react-native';
import { API_BASE } from './api';
import { authFetch, getAccessToken } from './authFetch';

type UploadFolder =
  | 'avatars'
  | 'listings'
  | 'stories'
  | 'butchers'
  | 'posts'
  | 'temp'
  | 'messages'
  | 'butcher-applications'
  | 'support';

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

type PresignSlot = UploadSlot & { fileKey?: string };

function guessMime(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function guessVideoMime(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  return 'video/mp4';
}

function fileNameFromUri(uri: string): string {
  const parts = uri.split(/[\\/]/);
  const name = parts[parts.length - 1];
  return name && name.length > 0 ? name : 'document';
}

function fileExtension(mimetype: string): string {
  return mimetype.split('/')[1] || 'jpg';
}

async function uploadToS3(slot: S3UploadSlot, localUri: string, mimetype: string): Promise<string> {
  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();

  const putRes = await fetch(slot.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimetype },
    body: blob,
  });

  if (!putRes.ok) {
    throw new Error('فشل رفع الملف');
  }

  return slot.cdnUrl;
}

async function uploadToCloudinary(
  slot: CloudinaryUploadSlot,
  localUri: string,
  mimetype: string,
): Promise<string> {
  const form = new FormData();
  const ext = fileExtension(mimetype);

  if (Platform.OS === 'web') {
    const blob = await (await fetch(localUri)).blob();
    form.append('file', blob, `upload.${ext}`);
  } else {
    form.append('file', {
      uri: localUri,
      type: mimetype,
      name: `upload.${ext}`,
    } as unknown as Blob);
  }

  form.append('api_key', slot.apiKey);
  form.append('timestamp', String(slot.timestamp));
  form.append('signature', slot.signature);
  form.append('folder', slot.folder);
  form.append('public_id', slot.publicId);

  const res = await fetch(slot.uploadUrl, { method: 'POST', body: form });
  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json.secure_url) {
    throw new Error(json.error?.message || 'فشل رفع الملف إلى Cloudinary');
  }

  return json.secure_url as string;
}

async function uploadToLocal(
  accessToken: string,
  slot: LocalUploadSlot,
  localUri: string,
  mimetype: string,
): Promise<string> {
  const form = new FormData();
  const ext = fileExtension(mimetype);

  if (Platform.OS === 'web') {
    const blob = await (await fetch(localUri)).blob();
    form.append('file', blob, `upload.${ext}`);
  } else {
    form.append('file', {
      uri: localUri,
      type: mimetype,
      name: `upload.${ext}`,
    } as unknown as Blob);
  }

  const url = `${API_BASE}/api/upload/direct?folder=${encodeURIComponent(slot.folder)}`;
  // Prefer authFetch so a stale token after ImagePicker AppState refresh can rotate once.
  const res = await authFetch(url, {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: form,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success || !json.data?.url) {
    throw new Error(json.messageAr || json.message || 'فشل رفع الملف محلياً');
  }

  return json.data.url as string;
}

export async function uploadMediaFromUri(
  accessToken: string,
  localUri: string,
  folder: UploadFolder,
  mediaType: 'image' | 'video' = 'image',
): Promise<string> {
  const mimetype = mediaType === 'video' ? guessVideoMime(localUri) : guessMime(localUri);
  // Use the live AuthProvider token when available (closure tokens go stale after refresh).
  const token = getAccessToken() ?? accessToken;

  const presignRes = await authFetch(`${API_BASE}/api/upload/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ mimetype, folder, count: 1 }),
  });

  const presignJson = await presignRes.json().catch(() => ({}));
  if (!presignRes.ok || !presignJson.success) {
    throw new Error(
      presignJson.messageAr ||
        presignJson.message ||
        (presignRes.status === 503
          ? 'خدمة رفع الصور غير مُعدّة على السيرفر'
          : 'فشل تجهيز الرفع'),
    );
  }

  const slot = presignJson.data?.urls?.[0] as UploadSlot | undefined;
  if (!slot?.uploadUrl) {
    throw new Error('استجابة الرفع غير صالحة');
  }

  const liveToken = getAccessToken() ?? token;

  if (slot.provider === 'local') {
    return uploadToLocal(liveToken, slot as LocalUploadSlot, localUri, mimetype);
  }

  if (slot.provider === 'cloudinary' || 'signature' in slot) {
    return uploadToCloudinary(slot as CloudinaryUploadSlot, localUri, mimetype);
  }

  if (!slot.cdnUrl) {
    throw new Error('استجابة الرفع غير صالحة');
  }

  return uploadToS3(slot, localUri, mimetype);
}

export async function uploadImageFromUri(
  accessToken: string,
  localUri: string,
  folder: UploadFolder,
): Promise<string> {
  return uploadMediaFromUri(accessToken, localUri, folder, 'image');
}

async function readLocalFileMeta(
  localUri: string,
  mimetype: string,
): Promise<{ blob: Blob; fileSizeBytes: number }> {
  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();
  return { blob, fileSizeBytes: blob.size };
}

async function uploadBlobToSlot(
  slot: UploadSlot,
  accessToken: string,
  localUri: string,
  mimetype: string,
  blob?: Blob,
): Promise<void> {
  if (slot.provider === 'local') {
    await uploadToLocal(accessToken, slot as LocalUploadSlot, localUri, mimetype);
    return;
  }
  if (slot.provider === 'cloudinary' || 'signature' in slot) {
    await uploadToCloudinary(slot as CloudinaryUploadSlot, localUri, mimetype);
    return;
  }
  if (!slot.cdnUrl) {
    throw new Error('استجابة الرفع غير صالحة');
  }
  const body = blob ?? (await (await fetch(localUri)).blob());
  const putRes = await fetch(slot.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimetype },
    body,
  });
  if (!putRes.ok) {
    throw new Error('فشل رفع الملف');
  }
}

/** Presign + upload for support ticket / verification attachments. */
export async function uploadSupportFileFromUri(
  accessToken: string,
  localUri: string,
  options: { originalFileName?: string; mimeType?: string } = {},
): Promise<{ fileKey: string; fileUrl: string; mimeType: string; fileSizeBytes: number; originalFileName: string }> {
  const mimetype = options.mimeType ?? guessMime(localUri);
  const originalFileName = options.originalFileName ?? fileNameFromUri(localUri);
  const { blob, fileSizeBytes } = await readLocalFileMeta(localUri, mimetype);

  const token = getAccessToken() ?? accessToken;
  const presignRes = await authFetch(`${API_BASE}/api/upload/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ mimetype, folder: 'support', count: 1 }),
  });

  const presignJson = await presignRes.json().catch(() => ({}));
  if (!presignRes.ok || !presignJson.success) {
    throw new Error(
      presignJson.messageAr ||
        presignJson.message ||
        (presignRes.status === 503
          ? 'خدمة رفع الملفات غير مُعدّة على السيرفر'
          : 'فشل تجهيز الرفع'),
    );
  }

  const slot = presignJson.data?.urls?.[0] as PresignSlot & { cdnUrl?: string } | undefined;
  if (!slot?.uploadUrl || !slot.fileKey) {
    throw new Error('استجابة الرفع غير صالحة');
  }

  const liveToken = getAccessToken() ?? token;
  let fileUrl: string;
  if (slot.provider === 'local') {
    fileUrl = await uploadToLocal(liveToken, slot as LocalUploadSlot, localUri, mimetype);
  } else if (slot.provider === 'cloudinary' || 'signature' in slot) {
    fileUrl = await uploadToCloudinary(slot as CloudinaryUploadSlot, localUri, mimetype);
  } else {
    await uploadBlobToSlot(slot, liveToken, localUri, mimetype, blob);
    if (!slot.cdnUrl) throw new Error('استجابة الرفع غير صالحة');
    fileUrl = slot.cdnUrl;
  }

  return {
    fileKey: slot.fileKey,
    fileUrl,
    mimeType: mimetype,
    fileSizeBytes,
    originalFileName,
  };
}
