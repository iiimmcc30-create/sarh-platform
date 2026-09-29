// services/upload.ts — رفع صورة عبر presign (Cloudinary أو S3)

import { Platform } from 'react-native';
import { API_BASE } from './api';
import { authFetch, getAccessToken } from './authFetch';

type UploadFolder =
  | 'avatars'
  | 'listings'
  | 'stories'
  | 'posts'
  | 'temp'
  | 'messages'
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
  /** Protected chat uploads: signed Cloudinary delivery type (sent as `type`). */
  type?: 'authenticated';
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

/** Voice-note mime from the file extension (native recordings are .m4a). */
export function guessAudioMime(uri: string): string {
  const lower = uri.toLowerCase().split('?')[0];
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.ogg') || lower.endsWith('.opus')) return 'audio/ogg';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.aac')) return 'audio/aac';
  return 'audio/mp4';
}

export type UploadMediaType = 'image' | 'video' | 'audio';

/** Client-side limits (MB) — mirror backend `UPLOAD_MAX_MB`. */
export const CHAT_UPLOAD_MAX_MB: Record<UploadMediaType, number> = {
  image: 20,
  video: 50,
  audio: 10,
};

export class UploadError extends Error {
  constructor(
    message: string,
    readonly code: 'too_large' | 'timeout' | 'aborted' | 'network' | 'server',
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

export type UploadMediaOptions = {
  /** Explicit mime (e.g. recorder output); otherwise guessed from the URI. */
  mimeType?: string;
  /** Known file size in bytes — enforced against the limit before uploading. */
  sizeBytes?: number;
  /** 0..1 progress callback (uses XHR so progress is reported on slow networks). */
  onProgress?: (fraction: number) => void;
  /** Abort the whole upload after this many ms (default 120s). */
  timeoutMs?: number;
  signal?: AbortSignal;
};

/** Throws an Arabic `UploadError` when a file exceeds the per-kind limit. */
export function assertUploadSize(
  mediaType: UploadMediaType,
  sizeBytes: number | undefined,
  maxMb = CHAT_UPLOAD_MAX_MB[mediaType],
): void {
  if (!sizeBytes || sizeBytes <= 0) return;
  if (sizeBytes > maxMb * 1024 * 1024) {
    const label =
      mediaType === 'video' ? 'الفيديو' : mediaType === 'audio' ? 'التسجيل الصوتي' : 'الصورة';
    throw new UploadError(`حجم ${label} أكبر من الحد المسموح (${maxMb} ميجابايت)`, 'too_large');
  }
}

type XhrResult = { status: number; body: string };

/** XHR request with progress, timeout and abort (fetch has no upload progress). */
function xhrSend(
  method: 'POST' | 'PUT',
  url: string,
  body: FormData | Blob,
  opts: {
    headers?: Record<string, string>;
    onProgress?: (fraction: number) => void;
    timeoutMs: number;
    signal?: AbortSignal;
  },
): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [k, v] of Object.entries(opts.headers ?? {})) xhr.setRequestHeader(k, v);
    xhr.timeout = opts.timeoutMs;
    if (xhr.upload && opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) opts.onProgress?.(Math.min(1, e.loaded / e.total));
      };
    }
    const onAbort = () => xhr.abort();
    opts.signal?.addEventListener('abort', onAbort);
    const done = () => opts.signal?.removeEventListener('abort', onAbort);
    xhr.onload = () => {
      done();
      opts.onProgress?.(1);
      resolve({ status: xhr.status, body: xhr.responseText ?? '' });
    };
    xhr.onerror = () => {
      done();
      reject(new UploadError('تعذّر الاتصال بالشبكة أثناء الرفع', 'network'));
    };
    xhr.ontimeout = () => {
      done();
      reject(new UploadError('انتهت مهلة الرفع، تحقق من الاتصال وأعد المحاولة', 'timeout'));
    };
    xhr.onabort = () => {
      done();
      reject(new UploadError('تم إلغاء الرفع', 'aborted'));
    };
    xhr.send(body as never);
  });
}

function parseJson(body: string): Record<string, any> {
  try {
    return JSON.parse(body) as Record<string, any>;
  } catch {
    return {};
  }
}

async function buildFileForm(localUri: string, mimetype: string): Promise<FormData> {
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
  return form;
}

async function uploadWithProgress(
  slot: UploadSlot,
  accessToken: string,
  localUri: string,
  mimetype: string,
  opts: Required<Pick<UploadMediaOptions, 'timeoutMs'>> & UploadMediaOptions,
): Promise<string> {
  const common = { onProgress: opts.onProgress, timeoutMs: opts.timeoutMs, signal: opts.signal };
  if (slot.provider === 'local') {
    const form = await buildFileForm(localUri, mimetype);
    const url = `${API_BASE}/api/upload/direct?folder=${encodeURIComponent(slot.folder)}`;
    const token = getAccessToken() ?? accessToken;
    const res = await xhrSend('POST', url, form, {
      ...common,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const json = parseJson(res.body);
    if (res.status < 200 || res.status >= 300 || !json.success || !json.data?.url) {
      throw new UploadError(json.messageAr || json.message || 'فشل رفع الملف محلياً', 'server');
    }
    return json.data.url as string;
  }
  if (slot.provider === 'cloudinary' || 'signature' in slot) {
    const c = slot as CloudinaryUploadSlot;
    const form = await buildFileForm(localUri, mimetype);
    form.append('api_key', c.apiKey);
    form.append('timestamp', String(c.timestamp));
    form.append('signature', c.signature);
    form.append('folder', c.folder);
    form.append('public_id', c.publicId);
    if (c.type) form.append('type', c.type);
    const res = await xhrSend('POST', c.uploadUrl, form, common);
    const json = parseJson(res.body);
    if (res.status < 200 || res.status >= 300 || !json.secure_url) {
      throw new UploadError(json.error?.message || 'فشل رفع الملف إلى Cloudinary', 'server');
    }
    return json.secure_url as string;
  }
  const s3 = slot as S3UploadSlot;
  if (!s3.cdnUrl) throw new UploadError('استجابة الرفع غير صالحة', 'server');
  const blob = await (await fetch(localUri)).blob();
  const res = await xhrSend('PUT', s3.uploadUrl, blob, {
    ...common,
    headers: { 'Content-Type': mimetype },
  });
  if (res.status < 200 || res.status >= 300) throw new UploadError('فشل رفع الملف', 'server');
  return s3.cdnUrl;
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
  if (slot.type) form.append('type', slot.type);

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
  mediaType: UploadMediaType = 'image',
  options?: UploadMediaOptions,
): Promise<string> {
  const mimetype =
    options?.mimeType ??
    (mediaType === 'video'
      ? guessVideoMime(localUri)
      : mediaType === 'audio'
        ? guessAudioMime(localUri)
        : guessMime(localUri));
  if (options) assertUploadSize(mediaType, options.sizeBytes);
  // Use the live AuthProvider token when available (closure tokens go stale after refresh).
  const token = getAccessToken() ?? accessToken;

  const presignRes = await authFetch(`${API_BASE}/api/upload/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mimetype,
      folder,
      count: 1,
      // Chat media: protected (signed, participant-only) delivery for new uploads.
      ...(folder === 'messages' && options ? { delivery: 'authenticated' } : {}),
    }),
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

  if (options) {
    // Server-announced limit wins when it is stricter than the client table.
    const serverMax = Number(presignJson.data?.maxSizeMb);
    if (Number.isFinite(serverMax) && serverMax > 0) {
      assertUploadSize(mediaType, options.sizeBytes, serverMax);
    }
    return uploadWithProgress(slot, liveToken, localUri, mimetype, {
      ...options,
      timeoutMs: options.timeoutMs ?? 120_000,
    });
  }

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
