/**
 * Settings redesign API client: per-type notification prefs, muted accounts,
 * connected sessions (read-only), payments history and «تحميل بياناتي».
 */
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';

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

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  messages: true,
  follows: true,
  interactions: true,
  followingPosts: true,
  councils: true,
  offers: true,
};

export const NOTIFICATION_PREF_COPY: Record<NotificationPrefKey, { label: string; hint: string; icon: string }> = {
  messages: { label: 'الرسائل', hint: 'رسائل المحادثات الجديدة', icon: 'mail-outline' },
  follows: { label: 'المتابعات', hint: 'عندما يتابعك أحد', icon: 'person-add-outline' },
  interactions: {
    label: 'الإعجابات والتعليقات',
    hint: 'الإعجابات والتعليقات وإعادة النشر وتفاعلات القصص',
    icon: 'heart-outline',
  },
  followingPosts: { label: 'منشورات من تتابعهم', hint: 'عندما ينشر حساب تتابعه', icon: 'newspaper-outline' },
  councils: { label: 'المجالس', hint: 'بدء المجالس والدعوات والتذكيرات', icon: 'mic-outline' },
  offers: { label: 'العروض', hint: 'العروض والتحديثات التسويقية', icon: 'pricetag-outline' },
};

export type NotificationSettings = {
  notificationsEnabled: boolean;
  prefs: NotificationPrefs;
};

export function normalizeNotificationSettings(raw: unknown): NotificationSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const prefsRaw = (r.prefs && typeof r.prefs === 'object' ? r.prefs : {}) as Record<string, unknown>;
  const prefs = { ...DEFAULT_NOTIFICATION_PREFS };
  for (const key of NOTIFICATION_PREF_KEYS) {
    if (typeof prefsRaw[key] === 'boolean') prefs[key] = prefsRaw[key] as boolean;
  }
  return {
    notificationsEnabled: r.notificationsEnabled !== false,
    prefs,
  };
}

/** Grey value beside «الإشعارات»: متوقفة / الكل / n من 6. */
export function notificationsSummary(s: NotificationSettings | null): string {
  if (!s) return '';
  if (!s.notificationsEnabled) return 'متوقفة';
  const on = NOTIFICATION_PREF_KEYS.filter((k) => s.prefs[k]).length;
  if (on === NOTIFICATION_PREF_KEYS.length) return 'الكل';
  if (on === 0) return 'متوقفة';
  return `${on} من ${NOTIFICATION_PREF_KEYS.length}`;
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await authFetch(`${API_BASE}${path}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { success?: boolean; data?: T };
    return json?.data ?? null;
  } catch {
    return null;
  }
}

async function sendJson<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
): Promise<{ data: T | null; message?: string }> {
  try {
    const res = await authFetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: T;
      messageAr?: string;
      message?: string;
    };
    if (!res.ok) {
      return { data: null, message: json.messageAr ?? json.message ?? 'تعذّر حفظ الإعدادات' };
    }
    return { data: json.data ?? null };
  } catch {
    return { data: null, message: 'تعذّر الاتصال بالخادم' };
  }
}

export async function fetchNotificationSettings(): Promise<NotificationSettings | null> {
  return normalizeNotificationSettings(await getJson('/api/users/me/notification-prefs'));
}

export async function updateNotificationSettings(
  patch: Partial<NotificationPrefs> & { notificationsEnabled?: boolean },
): Promise<{ settings: NotificationSettings | null; message?: string }> {
  const res = await sendJson<unknown>('/api/users/me/notification-prefs', 'PATCH', patch);
  return { settings: normalizeNotificationSettings(res.data), message: res.message };
}

export type MutedUser = {
  id: string;
  username: string;
  displayName: string;
  arabicName: string;
  avatar?: string | null;
  verified: boolean;
  verifiedTier?: string | null;
  mutedAt: string;
};

export async function fetchMutedUsers(): Promise<MutedUser[] | null> {
  const data = await getJson<{ users?: MutedUser[] }>('/api/users/me/muted');
  if (!data) return null;
  return Array.isArray(data.users) ? data.users : [];
}

export async function setMuteUser(
  userId: string,
  muted: boolean,
): Promise<{ ok: boolean; message?: string }> {
  const res = await sendJson<{ muted?: boolean }>(
    `/api/users/${encodeURIComponent(userId)}/mute`,
    'POST',
    { muted },
  );
  return res.data ? { ok: true } : { ok: false, message: res.message };
}

export type ConnectedSession = {
  id: string;
  label: string;
  platform: 'ios' | 'android' | 'web' | 'unknown';
  ip: string | null;
  signedInAt: string;
  expiresAt: string;
  /** Last token refresh (server ≥ sessions v2); falls back to signedInAt. */
  lastActiveAt?: string | null;
  /** «هذا الجهاز» — only when the lookup sent this device's refresh token. */
  current?: boolean;
};

export type SessionsResult = {
  sessions: ConnectedSession[];
  /** False on an older server: hide per-device sign-out. */
  canRevoke: boolean;
};

/** Same token store AuthContext writes (Keychain / Keystore; AsyncStorage on web); read-only here. */
async function readRefreshToken(): Promise<string | null> {
  try {
    // Lazy: keeps this module importable in plain-node tests.
    const { tokenStore } = await import('@/lib/secureTokenStore');
    return await tokenStore.getRefreshToken();
  } catch {
    return null;
  }
}

export async function fetchSessions(): Promise<ConnectedSession[] | null> {
  const data = await getJson<{ sessions?: ConnectedSession[] }>('/api/users/me/sessions');
  if (!data) return null;
  return Array.isArray(data.sessions) ? data.sessions : [];
}

/** Sessions with «هذا الجهاز» marked; falls back to the read-only list on older servers. */
export async function fetchSessionsDetailed(): Promise<SessionsResult | null> {
  const refreshToken = await readRefreshToken();
  const res = await sendJson<{ sessions?: ConnectedSession[] }>('/api/users/me/sessions/lookup', 'POST', {
    ...(refreshToken ? { refreshToken } : {}),
  });
  if (res.data && Array.isArray(res.data.sessions)) {
    return { sessions: res.data.sessions, canRevoke: true };
  }
  const legacy = await fetchSessions();
  return legacy ? { sessions: legacy, canRevoke: false } : null;
}

export async function revokeSession(sessionId: string): Promise<{ ok: boolean; message?: string }> {
  const res = await sendJson<{ revoked?: number }>(
    `/api/users/me/sessions/${encodeURIComponent(sessionId)}/revoke`,
    'POST',
    {},
  );
  return res.data ? { ok: true } : { ok: false, message: res.message };
}

export async function revokeOtherSessions(): Promise<{ ok: boolean; revoked?: number; message?: string }> {
  const refreshToken = await readRefreshToken();
  if (!refreshToken) return { ok: false, message: 'سجّل الدخول من جديد ثم حاول مرة أخرى' };
  const res = await sendJson<{ revoked?: number }>('/api/users/me/sessions/revoke-others', 'POST', {
    refreshToken,
  });
  return res.data ? { ok: true, revoked: res.data.revoked } : { ok: false, message: res.message };
}

/** Proxy / private addresses say nothing to the user — hide them. */
export function publicIpLabel(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v = ip.trim().replace(/^::ffff:/i, '');
  if (!v || /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc|fd|fe80)/i.test(v)) return null;
  return v;
}

export type PaymentRecord = {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded' | string;
  method: string;
  referenceType?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  paidAt?: string | null;
  createdAt: string;
};

export const PAYMENT_STATUS_AR: Record<string, string> = {
  pending: 'قيد الانتظار',
  paid: 'مدفوعة',
  failed: 'فشلت',
  refunded: 'مستردة',
};

export async function fetchPayments(): Promise<PaymentRecord[] | null> {
  const data = await getJson<{ payments?: PaymentRecord[] }>('/api/users/me/payments');
  if (!data) return null;
  return Array.isArray(data.payments) ? data.payments : [];
}

export async function fetchDataExport(): Promise<Record<string, unknown> | null> {
  return getJson<Record<string, unknown>>('/api/users/me/export');
}

/** Counts shown before saving the export file. */
export function summarizeExport(data: Record<string, unknown> | null): Array<{ label: string; count: number }> {
  if (!data) return [];
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  const comments = (data.comments ?? {}) as Record<string, unknown>;
  return [
    { label: 'الإعلانات', count: len(data.listings) },
    { label: 'المنشورات', count: len(data.posts) },
    { label: 'التعليقات', count: len(comments.posts) + len(comments.listings) },
    { label: 'المتابَعون', count: len(data.following) },
    { label: 'المتابعون', count: len(data.followers) },
    { label: 'المدفوعات', count: len(data.payments) },
    { label: 'تذاكر الدعم', count: len(data.supportTickets) },
  ];
}
