/**
 * Chat message model — one mapper for REST rows and socket payloads.
 * Handles legacy rows (text / imageUrl / videoUrl only, no `type`) and the
 * official kinds added later (VOICE with audioUrl + mediaDurationMs).
 */
import type { ChatMessage, ChatMessageKind } from '@/services/chatMessages';
import { resolveMediaUrl } from '@/services/media';

export type ApiChatMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  text?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  mediaDurationMs?: number | null;
  type?: string | null;
  createdAt: string;
  isRead?: boolean;
};

const KINDS: readonly ChatMessageKind[] = ['TEXT', 'IMAGE', 'VIDEO', 'VOICE'];

function asKind(value: unknown): ChatMessageKind | undefined {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value)
    ? (value as ChatMessageKind)
    : undefined;
}

/** Kind from explicit type when present, otherwise inferred from media fields. */
export function resolveChatMessageKind(m: {
  kind?: unknown;
  type?: unknown;
  audio?: string | null;
  image?: string | null;
  video?: string | null;
}): ChatMessageKind {
  const explicit = asKind(m.kind) ?? asKind(m.type);
  if (m.audio) return 'VOICE';
  if (m.video) return 'VIDEO';
  if (m.image) return 'IMAGE';
  if (explicit === 'VOICE') return 'VOICE';
  return 'TEXT';
}

function positiveMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}

export function mapApiMessage(m: ApiChatMessage): ChatMessage {
  const image = resolveMediaUrl(m.imageUrl) ?? undefined;
  const video = resolveMediaUrl(m.videoUrl) ?? undefined;
  const audio = resolveMediaUrl(m.audioUrl) ?? undefined;
  return {
    id: m.id,
    senderId: m.senderId,
    receiverId: m.receiverId,
    text: m.text ?? undefined,
    image,
    video,
    audio,
    durationMs: positiveMs(m.mediaDurationMs),
    kind: resolveChatMessageKind({ type: m.type, audio, image, video }),
    createdAt: m.createdAt,
    read: !!m.isRead,
  };
}

/** Inbox / notification preview for any message kind (legacy-safe). */
export function chatMessagePreview(m: {
  text?: string | null;
  image?: string | null;
  video?: string | null;
  audio?: string | null;
  kind?: ChatMessageKind;
}): string | null {
  const text = m.text?.trim();
  if (text) return text;
  if (m.audio || m.kind === 'VOICE') return '[رسالة صوتية]';
  if (m.video) return '[فيديو]';
  if (m.image) return '[صورة]';
  return null;
}

/** `m:ss` label for voice notes / media durations. */
export function formatMediaDuration(ms: number | null | undefined): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Human file size in Arabic-friendly units. */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

export type ChatMessageParts = {
  image: boolean;
  video: boolean;
  voice: boolean;
  text: boolean;
};

/**
 * What the bubble renders for a message (legacy rows with text + image, or
 * a video, still render every part; VOICE renders the audio player).
 */
export function chatMessageParts(m: {
  text?: string | null;
  image?: string | null;
  video?: string | null;
  audio?: string | null;
}): ChatMessageParts {
  return {
    image: Boolean(m.image),
    video: Boolean(m.video),
    voice: Boolean(m.audio),
    text: Boolean(m.text && m.text.length > 0),
  };
}
