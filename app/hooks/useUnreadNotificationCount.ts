// Shared unread-notification badge store.
//
// Previously every bell button mounted its own 45s poll with its own count, so:
// - after "mark all as read" other bells kept the old count until their next poll
//   (and focus refreshes were skipped inside the 45s window), and
// - new notifications showed up late, while several bells multiplied requests.
// Now there is one app-wide count, one poll, and instant refresh on foreground
// push, app resume, and local read actions.

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { fetchUnreadNotificationCount } from '@/services/notifications';

const POLL_MS = 30_000;
const MIN_GAP_MS = 4_000;

let count = 0;
let authed = false;
let lastFetchAt = 0;
let inflight: Promise<void> | null = null;
let subscribers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let pushSub: { remove: () => void } | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setUnreadNotificationCount(next: number) {
  const value = Math.max(0, Math.floor(next));
  if (value === count) return;
  count = value;
  emit();
}

export function decrementUnreadNotificationCount(by = 1) {
  setUnreadNotificationCount(count - by);
}

export async function refreshUnreadNotificationCount(opts?: { force?: boolean }) {
  if (!authed) {
    setUnreadNotificationCount(0);
    return;
  }
  if (!opts?.force && Date.now() - lastFetchAt < MIN_GAP_MS) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const next = await fetchUnreadNotificationCount();
      lastFetchAt = Date.now();
      setUnreadNotificationCount(next);
    } catch {
      // keep last known count
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

function start() {
  if (timer) return;
  timer = setInterval(() => {
    if (AppState.currentState === 'active') void refreshUnreadNotificationCount({ force: true });
  }, POLL_MS);
  appStateSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') void refreshUnreadNotificationCount({ force: true });
  });
  try {
    // A push arriving in the foreground should bump the badge right away.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications');
    pushSub = Notifications.addNotificationReceivedListener(() => {
      void refreshUnreadNotificationCount({ force: true });
    });
  } catch {
    pushSub = null;
  }
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  appStateSub?.remove();
  appStateSub = null;
  pushSub?.remove();
  pushSub = null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => count;

export function useUnreadNotificationCount() {
  const { isAuthenticated, accessToken } = useAuth();
  const unreadCount = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    authed = Boolean(isAuthenticated && accessToken);
    void refreshUnreadNotificationCount({ force: true });
  }, [isAuthenticated, accessToken]);

  useEffect(() => {
    subscribers += 1;
    start();
    return () => {
      subscribers -= 1;
      if (subscribers <= 0) stop();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshUnreadNotificationCount();
    }, []),
  );

  const refresh = useCallback(
    (o?: { force?: boolean }) => refreshUnreadNotificationCount(o),
    [],
  );
  return { unreadCount, refresh };
}
