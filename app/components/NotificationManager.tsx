// Mounts push notification listeners after login — no UI.

import { useNotifications } from '@/hooks/useNotifications';

export function NotificationManager() {
  useNotifications();
  return null;
}
