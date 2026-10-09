import { isPushAllowed } from '../../notifications/notification-prefs';

export function collectPushTokens(
  user: {
    fcmToken?: string | null;
    deviceTokens?: Array<{ token: string | null }>;
    notificationsEnabled?: boolean;
    /** Per-type prefs (Settings → الإشعارات); only read when `notification` is given. */
    notificationPrefs?: unknown;
  },
  notification?: { type: string; data?: Record<string, string> | null },
): string[] {
  if (!isPushAllowed(user, notification?.type, notification?.data)) return [];
  const tokens = new Set<string>();
  for (const row of user.deviceTokens ?? []) {
    if (row.token) tokens.add(row.token);
  }
  if (user.fcmToken) tokens.add(user.fcmToken);
  return [...tokens];
}
