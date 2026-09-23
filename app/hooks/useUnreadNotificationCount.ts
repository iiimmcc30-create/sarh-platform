// Lightweight unread badge count for header bell icon

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchUnreadNotificationCount } from '@/services/notifications';

const POLL_MS = 45_000;

export function useUnreadNotificationCount() {
  const { isAuthenticated, accessToken } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const mountedRef = useRef(true);
  const lastFetchAtRef = useRef(0);
  const inflightRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async (opts?: { force?: boolean }) => {
    if (!isAuthenticated || !accessToken) {
      setUnreadCount(0);
      return;
    }
    const force = opts?.force === true;
    const now = Date.now();
    // Avoid stacking focus refresh on top of the poll interval.
    if (!force && now - lastFetchAtRef.current < POLL_MS) {
      return;
    }
    if (inflightRef.current) {
      await inflightRef.current;
      return;
    }

    inflightRef.current = (async () => {
      try {
        const count = await fetchUnreadNotificationCount();
        lastFetchAtRef.current = Date.now();
        if (mountedRef.current) setUnreadCount(count);
      } catch {
        // Keep last known count on transient failures
      }
    })().finally(() => {
      inflightRef.current = null;
    });

    await inflightRef.current;
  }, [isAuthenticated, accessToken]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh({ force: true });
    const timer = setInterval(() => {
      void refresh({ force: true });
    }, POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return { unreadCount, refresh };
}
