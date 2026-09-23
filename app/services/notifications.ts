// In-app notifications API — GET / PATCH /api/notifications

import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import { dedupeInflight } from '@/services/requestCoordination';

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  messageAr?: string;
  message_ar?: string;
  message?: string;
};

export type AppNotification = {
  id: string;
  userId: string;
  type: string;
  titleAr: string;
  bodyAr: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

export type NotificationListResult = {
  notifications: AppNotification[];
  nextCursor: string | null;
  hasMore: boolean;
  unreadCount: number;
};

export class NotificationApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly messageAr: string;

  constructor(status: number, code: string, messageAr: string) {
    super(messageAr);
    this.name = 'NotificationApiError';
    this.status = status;
    this.code = code;
    this.messageAr = messageAr;
  }
}

async function parseEnvelope<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (!res.ok || json.success === false) {
    throw new NotificationApiError(
      res.status,
      json.error ?? 'server_error',
      json.messageAr ?? json.message_ar ?? json.message ?? 'خطأ في الخادم',
    );
  }

  if (json.success === true && json.data !== undefined) {
    return json.data;
  }

  return json as unknown as T;
}

function normalizeNotification(raw: AppNotification): AppNotification {
  const data =
    raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)
      ? (raw.data as Record<string, unknown>)
      : null;
  return { ...raw, data };
}

export type NotificationListQuery = {
  cursor?: string;
};

export async function fetchNotifications(
  query: NotificationListQuery = {},
): Promise<NotificationListResult> {
  const params = new URLSearchParams();
  if (query.cursor) params.set('cursor', query.cursor);
  const qs = params.toString();

  const res = await authFetch(`${API_BASE}/api/notifications${qs ? `?${qs}` : ''}`);
  const data = await parseEnvelope<NotificationListResult>(res);
  return {
    ...data,
    notifications: data.notifications.map(normalizeNotification),
  };
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const body = ids && ids.length > 0 ? { ids } : {};
  const res = await authFetch(`${API_BASE}/api/notifications`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  await parseEnvelope<{ updated: boolean }>(res);
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  return dedupeInflight('GET:/api/notifications/unread-count', async () => {
    const res = await authFetch(`${API_BASE}/api/notifications/unread-count`);
    const data = await parseEnvelope<{ unreadCount: number }>(res);
    return data.unreadCount ?? 0;
  });
}

export function toNotificationApiError(err: unknown): NotificationApiError | null {
  return err instanceof NotificationApiError ? err : null;
}
