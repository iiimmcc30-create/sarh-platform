// Hook for in-app notification center list

import { useCallback, useEffect, useRef, useState } from 'react';
import type { InboxTab } from '@/lib/notificationInbox';
import {
  fetchNotifications,
  markNotificationsRead,
  toNotificationApiError,
  type AppNotification,
} from '@/services/notifications';
import {
  decrementUnreadNotificationCount,
  refreshUnreadNotificationCount,
  setUnreadNotificationCount,
} from '@/hooks/useUnreadNotificationCount';

function errorMessage(err: unknown): string {
  const api = toNotificationApiError(err);
  if (api) return api.messageAr;
  if (err instanceof Error) return err.message;
  return 'حدث خطأ غير متوقع';
}

export function useNotificationsList(tab: InboxTab = 'all') {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadingMoreRef = useRef(false);

  const applyPage = useCallback((page: Awaited<ReturnType<typeof fetchNotifications>>, append: boolean) => {
    setNotifications((prev) =>
      append ? [...prev, ...page.notifications] : page.notifications,
    );
    setUnreadCount(page.unreadCount);
    setUnreadNotificationCount(page.unreadCount);
    setNextCursor(page.nextCursor);
    setHasMore(page.hasMore);
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchNotifications({ tab });
      applyPage(page, false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [applyPage, tab]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setNotifications([]);
      setNextCursor(null);
      setHasMore(false);
      setLoading(true);
      setError(null);
      try {
        const page = await fetchNotifications({ tab });
        if (cancelled) return;
        applyPage(page, false);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyPage, tab]);

  // New pushes while the list is open show up right away (no manual pull).
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifications = require('expo-notifications');
      sub = Notifications.addNotificationReceivedListener(() => {
        void fetchNotifications({ tab })
          .then((page) => applyPage(page, false))
          .catch(() => {});
      });
    } catch {
      sub = null;
    }
    return () => sub?.remove();
  }, [applyPage, tab]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const page = await fetchNotifications({ tab });
      applyPage(page, false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }, [applyPage, tab]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchNotifications({ cursor: nextCursor, tab });
      applyPage(page, true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [applyPage, hasMore, nextCursor, tab]);

  const markAsRead = useCallback(async (id: string) => {
    let wasUnread = false;
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        wasUnread = !n.isRead;
        return { ...n, isRead: true, readAt: new Date().toISOString() };
      }),
    );
    if (wasUnread) {
      setUnreadCount((c) => Math.max(0, c - 1));
      decrementUnreadNotificationCount();
    }
    try {
      await markNotificationsRead([id]);
    } catch {
      await refresh();
    }
  }, [refresh]);

  const markIds = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const unread = new Set(ids);
    let cleared = 0;
    setNotifications((prev) =>
      prev.map((n) => {
        if (!unread.has(n.id) || n.isRead) return n;
        cleared += 1;
        return { ...n, isRead: true, readAt: new Date().toISOString() };
      }),
    );
    if (cleared > 0) {
      setUnreadCount((c) => Math.max(0, c - cleared));
      for (let i = 0; i < cleared; i += 1) decrementUnreadNotificationCount();
    }
    try {
      await markNotificationsRead(ids);
    } catch {
      await refresh();
    }
  }, [refresh]);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt ?? new Date().toISOString() })),
    );
    setUnreadCount(0);
    setUnreadNotificationCount(0);
    try {
      await markNotificationsRead();
      void refreshUnreadNotificationCount({ force: true });
    } catch (err) {
      setError(errorMessage(err));
      await refresh();
    }
  }, [refresh]);

  return {
    notifications,
    unreadCount,
    hasMore,
    loading,
    loadingMore,
    refreshing,
    error,
    refresh,
    loadMore,
    markAsRead,
    markIds,
    markAllAsRead,
    retry: loadInitial,
  };
}
