// Hook for in-app notification center list

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchNotifications,
  markNotificationsRead,
  toNotificationApiError,
  type AppNotification,
} from '@/services/notifications';

function errorMessage(err: unknown): string {
  const api = toNotificationApiError(err);
  if (api) return api.messageAr;
  if (err instanceof Error) return err.message;
  return 'حدث خطأ غير متوقع';
}

export function useNotificationsList() {
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
    setNextCursor(page.nextCursor);
    setHasMore(page.hasMore);
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchNotifications();
      applyPage(page, false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [applyPage]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const page = await fetchNotifications();
      applyPage(page, false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }, [applyPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchNotifications({ cursor: nextCursor });
      applyPage(page, true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [applyPage, hasMore, nextCursor]);

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
    }
    try {
      await markNotificationsRead([id]);
    } catch {
      await refresh();
    }
  }, [refresh]);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt ?? new Date().toISOString() })),
    );
    setUnreadCount(0);
    try {
      await markNotificationsRead();
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
    markAllAsRead,
    retry: loadInitial,
  };
}
