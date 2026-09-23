import type { ChatMessage } from '@/services/chatMessages';
import { resolveMediaUrl } from '@/services/media';

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

  return {
    threadId,
    message: {
      id,
      senderId,
      receiverId,
      text: asString(raw.text),
      image: resolveMediaUrl(image) ?? image,
      video: resolveMediaUrl(video) ?? video,
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
    return !(sameText && sameImage && sameVideo);
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
