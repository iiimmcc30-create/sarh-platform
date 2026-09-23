// SAFAT — Push notification lifecycle hook (post-login only)

import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  cleanupListeners,
  getInitialNotificationData,
  handleNotificationNavigation,
  listenForegroundNotifications,
  listenNotificationResponses,
  registerForPushNotifications,
  syncPushToken,
} from '@/lib/notifications';

/**
 * Registers push notifications after authentication, syncs FCM token to backend,
 * and wires foreground / tap handlers. No-ops before login.
 */
export function useNotifications(): void {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const initialHandledRef = useRef(false);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user?.id) {
      return;
    }

    const isAdmin = user.role === 'ADMIN';
    const routeCtx = { router, isAdmin };

    const onNotificationResponse = (data: Record<string, unknown>) => {
      handleNotificationNavigation(data, routeCtx);
    };

    const foregroundSub = listenForegroundNotifications();
    const responseSub = listenNotificationResponses(onNotificationResponse);

    (async () => {
      await registerForPushNotifications();
      await syncPushToken(user.id);
    })();

    if (!initialHandledRef.current) {
      initialHandledRef.current = true;
      getInitialNotificationData().then((data) => {
        if (data && Object.keys(data).length > 0) {
          handleNotificationNavigation(data, routeCtx);
        }
      });
    }

    return () => {
      cleanupListeners([foregroundSub, responseSub]);
    };
  }, [isAuthenticated, isLoading, user?.id, user?.role, router]);
}
