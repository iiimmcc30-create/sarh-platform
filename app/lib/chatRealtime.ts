import type { ChatMessage } from '@/services/chatMessages';
import { resolveMediaUrl } from '@/services/media';
import { resolveChatMessageKind } from '@/lib/chatMessageModel';

export type ChatSocketLike = {
  emit: (event: string, ...args: unknown[]) => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off: (event: string, handler: (...args: unknown[]) => void) => void;
};

type ParsedChatEvent = {
  threadId?: string;
  message: ChatMessage;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function parseChatSocketPayload(payload: unknown): ParsedChatEvent | null {
  const root = asRecord(payload);
  if (!root) return null;

  const nested = asRecord(root.message);
  const raw = nested ?? root;
  const id = asString(raw.id);
  const senderId = asString(raw.senderId);
  const receiverId = asString(raw.receiverId);
  const createdAt = asString(raw.createdAt) ?? new Date().toISOString();
  if (!id || !senderId || !receiverId) return null;

  const threadId = asString(raw.threadId) ?? asString(root.threadId);
  const image = asString(raw.image) ?? asString(raw.imageUrl);
  const video = asString(raw.video) ?? asString(raw.videoUrl);
  const audioRaw = asString(raw.audio) ?? asString(raw.audioUrl);
  const audio = resolveMediaUrl(audioRaw) ?? audioRaw;
  const durationRaw = raw.mediaDurationMs ?? raw.durationMs;
  const durationMs =
    typeof durationRaw === 'number' && Number.isFinite(durationRaw) && durationRaw > 0
      ? Math.round(durationRaw)
      : undefined;
  const resolvedImage = resolveMediaUrl(image) ?? image;
  const resolvedVideo = resolveMediaUrl(video) ?? video;

  return {
    threadId,
    message: {
      id,
      senderId,
      receiverId,
      text: asString(raw.text),
      image: resolvedImage,
      video: resolvedVideo,
      ...(audio ? { audio } : {}),
      ...(durationMs ? { durationMs } : {}),
      kind: resolveChatMessageKind({
        type: raw.type,
        audio,
        image: resolvedImage,
        video: resolvedVideo,
      }),
      createdAt,
      read: Boolean(raw.isRead ?? raw.read),
    },
  };
}

export function mergeChatMessages(
  prev: ChatMessage[],
  incoming: ChatMessage,
): ChatMessage[] {
  if (prev.some((item) => item.id === incoming.id)) return prev;

  const withoutOptimisticDup = prev.filter((item) => {
    if (!item.id.startsWith('temp_')) return true;
    if (item.senderId !== incoming.senderId) return true;
    const sameText = (item.text ?? '') === (incoming.text ?? '');
    const sameImage = (item.image ?? '') === (incoming.image ?? '');
    const sameVideo = (item.video ?? '') === (incoming.video ?? '');
    const sameAudio = (item.audio ?? '') === (incoming.audio ?? '');
    return !(sameText && sameImage && sameVideo && sameAudio);
  });

  return [...withoutOptimisticDup, incoming];
}

export function applyChatSocketEvent(
  prev: ChatMessage[],
  payload: unknown,
  expectedThreadId: string,
): ChatMessage[] {
  const parsed = parseChatSocketPayload(payload);
  if (!parsed) return prev;
  if (parsed.threadId && parsed.threadId !== expectedThreadId) return prev;
  return mergeChatMessages(prev, parsed.message);
}

export function attachChatThreadListener(
  socket: ChatSocketLike,
  threadId: string,
  onPayload: (payload: unknown) => void,
): () => void {
  socket.emit('chat:join', threadId);
  const handler = (payload: unknown) => {
    onPayload(payload);
  };
  socket.on('chat:message', handler);
  return () => {
    socket.emit('chat:leave', threadId);
    socket.off('chat:message', handler);
  };
}

/**
 * Apply a (re)loaded server page without dropping local state.
 *
 * The thread GET can resolve after local changes were made — e.g. the token
 * refresh fired when returning from the image picker re-runs the load while
 * a voice note is uploading or was just delivered. Replacing the list with
 * that snapshot made the voice bubble disappear. Keep every optimistic /
 * uploading / failed bubble (`temp_*`) and every real message delivered
 * after the snapshot (POST response / socket) that the page does not have.
 */
export function reconcileLoadedMessages(
  prev: ChatMessage[],
  loaded: ChatMessage[],
): ChatMessage[] {
  if (prev.length === 0) return loaded;
  const loadedIds = new Set(loaded.map((m) => m.id));
  let newestLoadedAt = Number.NEGATIVE_INFINITY;
  for (const m of loaded) {
    const at = Date.parse(m.createdAt);
    if (Number.isFinite(at) && at > newestLoadedAt) newestLoadedAt = at;
  }
  let oldestLoadedAt = Number.POSITIVE_INFINITY;
  for (const m of loaded) {
    const at = Date.parse(m.createdAt);
    if (Number.isFinite(at) && at < oldestLoadedAt) oldestLoadedAt = at;
  }
  // Older pages loaded by scrolling up stay above the refreshed newest page.
  const older = prev.filter((m) => {
    if (loadedIds.has(m.id) || m.id.startsWith('temp_')) return false;
    const at = Date.parse(m.createdAt);
    return Number.isFinite(at) && at < oldestLoadedAt;
  });
  const extras = prev.filter((m) => {
    if (loadedIds.has(m.id)) return false;
    if (m.id.startsWith('temp_')) return true;
    const at = Date.parse(m.createdAt);
    return !Number.isFinite(at) || at >= newestLoadedAt;
  });
  if (!older.length && !extras.length) return loaded;
  return [...older, ...loaded, ...extras];
}

/**
 * Prepend an older server page (oldest → newest) above the current thread,
 * skipping ids already present (socket / reload overlap).
 */
export function prependOlderMessages(prev: ChatMessage[], older: ChatMessage[]): ChatMessage[] {
  if (older.length === 0) return prev;
  const have = new Set(prev.map((m) => m.id));
  const fresh = older.filter((m) => !have.has(m.id));
  return fresh.length ? [...fresh, ...prev] : prev;
}

/** Cursor for the next older page from a thread GET payload; null when the start is reached. */
export function chatOlderCursor(data: { hasMore?: unknown; nextCursor?: unknown } | null | undefined): string | null {
  if (!data || data.hasMore !== true) return null;
  return typeof data.nextCursor === 'string' && data.nextCursor ? data.nextCursor : null;
}
