/**
 * Chat thread rows: quiet day separators + sender grouping (WhatsApp-style
 * organisation). Pure — the chat screen renders these rows in its FlatList.
 */
import type { ChatMessage } from '@/services/chatMessages';

/** Consecutive messages from one sender within this window share a group. */
export const CHAT_GROUP_WINDOW_MS = 5 * 60 * 1000;

export type ChatDayRow = { type: 'day'; key: string; label: string };
export type ChatMessageRow = {
  type: 'message';
  key: string;
  message: ChatMessage;
  /** Same sender as the previous bubble (tight spacing, no tail). */
  groupedWithPrev: boolean;
  /** Same sender as the next bubble (the tail sits on the last one). */
  groupedWithNext: boolean;
};
export type ChatRow = ChatDayRow | ChatMessageRow;

function toDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local calendar day key (YYYY-MM-DD); unknown dates share one bucket. */
export function chatDayKey(iso: string): string {
  const d = toDate(iso);
  if (!d) return 'unknown';
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** «اليوم» / «أمس» / localized date for older days. */
export function chatDayLabel(iso: string, now: Date = new Date()): string {
  const d = toDate(iso);
  if (!d) return '';
  const key = chatDayKey(iso);
  if (key === chatDayKey(now.toISOString())) return 'اليوم';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === chatDayKey(yesterday.toISOString())) return 'أمس';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('ar-SA', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function groupable(a: ChatMessage, b: ChatMessage): boolean {
  if (a.senderId !== b.senderId) return false;
  if (chatDayKey(a.createdAt) !== chatDayKey(b.createdAt)) return false;
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return true;
  return Math.abs(tb - ta) <= CHAT_GROUP_WINDOW_MS;
}

/** Messages (oldest → newest) → rows with day separators and grouping flags. */
export function buildChatRows(messages: ChatMessage[], now: Date = new Date()): ChatRow[] {
  const rows: ChatRow[] = [];
  let lastDay: string | null = null;
  messages.forEach((message, i) => {
    const day = chatDayKey(message.createdAt);
    if (day !== lastDay) {
      rows.push({ type: 'day', key: `day_${day}`, label: chatDayLabel(message.createdAt, now) });
      lastDay = day;
    }
    const prev = messages[i - 1];
    const next = messages[i + 1];
    rows.push({
      type: 'message',
      key: message.id,
      message,
      groupedWithPrev: Boolean(prev && groupable(prev, message)),
      groupedWithNext: Boolean(next && groupable(message, next)),
    });
  });
  return rows;
}
