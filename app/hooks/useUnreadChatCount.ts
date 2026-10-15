// Tab-bar badge: unread incoming chat messages (sum over the cached inbox).
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import {
  cachedInboxUnreadTotal,
  fetchMessageInbox,
  subscribeMessageInbox,
} from '@/hooks/useMessageThreads';

const POLL_MS = 30_000;

export function useUnreadChatCount(): number {
  const { isAuthenticated, accessToken } = useAuth();
  const count = useSyncExternalStore(
    subscribeMessageInbox,
    cachedInboxUnreadTotal,
    cachedInboxUnreadTotal,
  );

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return undefined;
    const token = accessToken;
    const load = (force = false) => {
      if (AppState.currentState !== 'active') return;
      void fetchMessageInbox(token, 'ALL', { force }).catch(() => {});
    };
    load();
    const timer = setInterval(() => load(true), POLL_MS);
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') load(true);
    });
    let pushSub: { remove: () => void } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifications = require('expo-notifications');
      pushSub = Notifications.addNotificationReceivedListener(() => load(true));
    } catch {
      pushSub = null;
    }
    return () => {
      clearInterval(timer);
      appSub.remove();
      pushSub?.remove();
    };
  }, [isAuthenticated, accessToken]);

  return isAuthenticated ? count : 0;
}
