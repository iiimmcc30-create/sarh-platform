import type { MessageContentType } from '@prisma/client';

/** Max voice note length accepted by REST and socket sends (5 minutes). */
export const VOICE_MAX_DURATION_MS = 5 * 60 * 1000;

export type MessagePayloadInput = {
  text?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  durationMs?: number | null;
  messageType?: MessageContentType | null;
  mediaMimeType?: string | null;
  mediaSizeBytes?: number | null;
};

export type ResolvedMessagePayload = {
  type: MessageContentType;
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  mediaDurationMs?: number;
  mediaMimeType?: string;
  mediaSizeBytes?: number;
};

export type MessagePayloadError = {
  code: 'empty_message' | 'invalid_message';
  message: string;
};

/**
 * Single source of truth for message content rules (REST + socket).
 * Legacy clients never send `messageType`; the kind is inferred from the URLs.
 */
export function resolveMessagePayload(
  input: MessagePayloadInput,
): ResolvedMessagePayload | MessagePayloadError {
  const text = input.text?.trim() || undefined;
  const imageUrl = input.imageUrl || undefined;
  const videoUrl = input.videoUrl || undefined;
  const audioUrl = input.audioUrl || undefined;
  const mediaCount = [imageUrl, videoUrl, audioUrl].filter(Boolean).length;

  if (!text && mediaCount === 0) {
    return {
      code: 'empty_message',
      message: 'يجب إرسال نص أو صورة أو فيديو أو رسالة صوتية',
    };
  }
  if (mediaCount > 1) {
    return {
      code: 'invalid_message',
      message: 'يمكن إرفاق وسيط واحد فقط في الرسالة',
    };
  }

  const inferred: MessageContentType = audioUrl
    ? 'VOICE'
    : videoUrl
      ? 'VIDEO'
      : imageUrl
        ? 'IMAGE'
        : 'TEXT';
  const type = input.messageType ?? inferred;
  if (type !== inferred) {
    return {
      code: 'invalid_message',
      message: 'نوع الرسالة لا يطابق المحتوى المرفق',
    };
  }

  const out: ResolvedMessagePayload = { type };
  if (text) out.text = text;
  if (imageUrl) out.imageUrl = imageUrl;
  if (videoUrl) out.videoUrl = videoUrl;

  if (type === 'VOICE') {
    const d = input.durationMs;
    if (
      typeof d !== 'number' ||
      !Number.isFinite(d) ||
      d < 1 ||
      d > VOICE_MAX_DURATION_MS
    ) {
      return {
        code: 'invalid_message',
        message: 'مدة الرسالة الصوتية غير صالحة',
      };
    }
    out.audioUrl = audioUrl;
    out.mediaDurationMs = Math.round(d);
  } else if (
    typeof input.durationMs === 'number' &&
    Number.isFinite(input.durationMs) &&
    input.durationMs > 0 &&
    type === 'VIDEO'
  ) {
    out.mediaDurationMs = Math.round(input.durationMs);
  }

  if (type !== 'TEXT') {
    if (input.mediaMimeType) out.mediaMimeType = input.mediaMimeType;
    if (
      typeof input.mediaSizeBytes === 'number' &&
      Number.isFinite(input.mediaSizeBytes) &&
      input.mediaSizeBytes > 0
    ) {
      out.mediaSizeBytes = Math.round(input.mediaSizeBytes);
    }
  }
  return out;
}

export function isMessagePayloadError(
  v: ResolvedMessagePayload | MessagePayloadError,
): v is MessagePayloadError {
  return 'code' in v;
}

type PreviewSource = {
  text?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  type?: MessageContentType | string | null;
};

/** Inbox list preview (legacy bracket style kept for text-less media). */
export function inboxPreview(
  msg: PreviewSource | undefined | null,
): string | null {
  if (!msg) return null;
  if (msg.text) return msg.text;
  if (msg.audioUrl || msg.type === 'VOICE') return '[رسالة صوتية]';
  if (msg.videoUrl) return '[فيديو]';
  if (msg.imageUrl) return '[صورة]';
  return null;
}

/** Short realtime notification preview. */
export function notificationPreview(msg: PreviewSource): string {
  const text = msg.text?.trim();
  if (text) return text.slice(0, 60);
  if (msg.audioUrl || msg.type === 'VOICE') return '🎤 رسالة صوتية';
  if (msg.videoUrl) return '🎬 فيديو';
  return '📷 صورة';
}

/** Push notification body. */
export function pushBody(msg: PreviewSource): string {
  const text = msg.text?.trim();
  if (text) return text;
  if (msg.audioUrl || msg.type === 'VOICE') return 'أرسل رسالة صوتية';
  if (msg.videoUrl) return 'أرسل فيديو';
  return 'أرسل صورة';
}
