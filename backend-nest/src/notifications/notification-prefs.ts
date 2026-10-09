/**
 * Per-type push preferences (Settings → الإشعارات). Pure helpers shared by the
 * users API (read/write) and the push decision (`collectPushTokens`).
 *
 * Only PUSH is gated: the in-app notification row is still stored, so the
 * notifications screen stays complete. Account / payment / security notices
 * (category `account`) can never be switched off.
 */
export const NOTIFICATION_PREF_KEYS = [
  'messages',
  'follows',
  'interactions',
  'followingPosts',
  'councils',
  'offers',
] as const;

export type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number];
export type NotificationPrefs = Record<NotificationPrefKey, boolean>;
export type NotificationCategory = NotificationPrefKey | 'account';

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  messages: true,
  follows: true,
  interactions: true,
  followingPosts: true,
  councils: true,
  offers: true,
};

/** Stored JSON → full prefs (unknown keys dropped, missing keys = on). */
export function normalizeNotificationPrefs(raw: unknown): NotificationPrefs {
  const out: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const row = raw as Record<string, unknown>;
  for (const key of NOTIFICATION_PREF_KEYS) {
    if (typeof row[key] === 'boolean') out[key] = row[key];
  }
  return out;
}

/** Which preference a notification belongs to. */
export function notificationCategory(
  type: string,
  data?: Record<string, string> | null,
): NotificationCategory {
  switch (type) {
    case 'new_message':
      return 'messages';
    case 'follow':
      return 'follows';
    case 'like':
    case 'comment':
    case 'repost':
    case 'story_reaction':
    case 'story_reply':
      return 'interactions';
    case 'live_start':
      return 'councils';
    case 'offer':
      return 'offers';
    default:
      break;
  }
  if (type === 'system' && data) {
    if (typeof data.kind === 'string' && data.kind.startsWith('council_')) {
      return 'councils';
    }
    if (data.postId && data.authorId) return 'followingPosts';
  }
  return 'account';
}

/** Push decision for one notification. Master switch first, then the category. */
export function isPushAllowed(
  user: { notificationsEnabled?: boolean; notificationPrefs?: unknown },
  type?: string,
  data?: Record<string, string> | null,
): boolean {
  if (user.notificationsEnabled === false) return false;
  if (!type) return true;
  const category = notificationCategory(type, data);
  if (category === 'account') return true;
  return normalizeNotificationPrefs(user.notificationPrefs)[category];
}
