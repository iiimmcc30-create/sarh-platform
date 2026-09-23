export function collectPushTokens(user: {
  fcmToken?: string | null;
  deviceTokens?: Array<{ token: string | null }>;
  notificationsEnabled?: boolean;
}): string[] {
  if (user.notificationsEnabled === false) return [];
  const tokens = new Set<string>();
  for (const row of user.deviceTokens ?? []) {
    if (row.token) tokens.add(row.token);
  }
  if (user.fcmToken) tokens.add(user.fcmToken);
  return [...tokens];
}
