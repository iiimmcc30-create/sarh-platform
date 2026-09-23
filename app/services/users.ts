import { API_BASE } from '@/services/api';
import { parseApiError } from '@/services/apiError';
import { authFetch } from '@/services/authFetch';
import { dedupeInflight, shouldReuseFreshResult } from '@/services/requestCoordination';

export type BlockResult =
  | { ok: true; blocked: boolean }
  | { ok: false; message: string };

export type PublicUserProfile = {
  id: string;
  username: string;
  displayName: string;
  arabicName: string;
  avatar?: string;
  coverImage?: string;
  bio?: string;
  verified: boolean;
  isAI?: boolean;
  country?: string;
  role?: string;
  /** Derived: USER | BUTCHER | LIVESTOCK_TRADER */
  accountType?: 'USER' | 'BUTCHER' | 'LIVESTOCK_TRADER';
  /** Account rating average (1–5), null when no reviews yet */
  rating: number | null;
  reviewCount: number;
  /** The current viewer's own rating of this account, if any (editable) */
  myRating?: number | null;
  followersCount: number;
  followingCount: number;
  listingsCount: number;
  postsCount: number;
  isFollowing: boolean;
  isBlocked?: boolean;
  allowPrivateMessages?: boolean;
  showFollowingList?: boolean;
  showInSearch?: boolean;
};

/** Same local window as other focus screens — skip a refetch while the profile is fresh. */
export const PUBLIC_PROFILE_TTL_MS = 60_000;

type PublicProfileCacheEntry = {
  profile: PublicUserProfile;
  at: number;
};

const publicProfileCache = new Map<string, PublicProfileCacheEntry>();

/** Test-only reset of per-userId profile cache. */
export function resetPublicProfileCache(): void {
  publicProfileCache.clear();
}

export function getCachedUserProfile(userId: string): PublicUserProfile | null {
  const id = userId?.trim();
  if (!id) return null;
  return publicProfileCache.get(id)?.profile ?? null;
}

export function peekUserProfileCachedAt(userId: string): number | undefined {
  const id = userId?.trim();
  if (!id) return undefined;
  return publicProfileCache.get(id)?.at;
}

async function loadUserProfileNetwork(userId: string): Promise<PublicUserProfile | null> {
  const res = await authFetch(`${API_BASE}/api/users/${userId}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success || !json.data) return null;
  if (typeof json.data.isFollowing !== 'boolean') {
    console.warn('[Follow] profile response omitted boolean isFollowing', {
      userId,
      value: json.data.isFollowing,
    });
    return null;
  }
  return json.data as PublicUserProfile;
}

export function fetchUserProfile(
  userId: string,
  options?: { force?: boolean },
): Promise<PublicUserProfile | null> {
  const id = userId?.trim();
  if (!id) return Promise.resolve(null);

  const force = options?.force === true;
  const cached = publicProfileCache.get(id);
  if (cached && shouldReuseFreshResult(cached.at, PUBLIC_PROFILE_TTL_MS, force)) {
    return Promise.resolve(cached.profile);
  }

  return dedupeInflight(`GET:/api/users/${id}`, async () => {
    try {
      const profile = await loadUserProfileNetwork(id);
      if (profile) {
        publicProfileCache.set(id, { profile, at: Date.now() });
        return profile;
      }
      return publicProfileCache.get(id)?.profile ?? null;
    } catch {
      return publicProfileCache.get(id)?.profile ?? null;
    }
  });
}

export async function checkUsernameAvailable(username: string): Promise<boolean | null> {
  const value = username.replace(/\s/g, '').toLowerCase();
  if (!value) return null;
  const res = await authFetch(
    `${API_BASE}/api/users/username-available?username=${encodeURIComponent(value)}`,
  );
  if (!res.ok) return null;
  const json = await res.json();
  if (json.success && typeof json.data?.available === 'boolean') {
    return json.data.available;
  }
  return null;
}

export type ConnectionUser = {
  id: string;
  username: string;
  displayName: string;
  arabicName: string;
  avatar?: string;
  verified: boolean;
  isFollowing: boolean;
};

export type PrivacySettings = {
  showInSearch: boolean;
  allowPrivateMessages: boolean;
  showFollowingList: boolean;
  commentsAudience: 'everyone' | 'followers';
  privateMessagesAudience: 'everyone' | 'following';
  notificationsEnabled: boolean;
};

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  showInSearch: true,
  allowPrivateMessages: true,
  showFollowingList: true,
  commentsAudience: 'everyone',
  privateMessagesAudience: 'everyone',
  notificationsEnabled: true,
};

export type AccountSettings = {
  phone: string | null;
  email: string | null;
  birthDate: string | null;
};

function parsePrivacySettings(data: unknown): PrivacySettings | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  const showInSearch =
    typeof row.showInSearch === 'boolean' ? row.showInSearch : true;
  const allowPrivateMessages =
    typeof row.allowPrivateMessages === 'boolean' ? row.allowPrivateMessages : true;
  const showFollowingList =
    typeof row.showFollowingList === 'boolean' ? row.showFollowingList : true;
  const commentsAudience =
    row.commentsAudience === 'followers' ? 'followers' : 'everyone';
  const privateMessagesAudience =
    row.privateMessagesAudience === 'following' ? 'following' : 'everyone';
  const notificationsEnabled =
    typeof row.notificationsEnabled === 'boolean' ? row.notificationsEnabled : true;

  if (
    typeof row.showInSearch !== 'boolean' &&
    typeof row.allowPrivateMessages !== 'boolean' &&
    typeof row.showFollowingList !== 'boolean' &&
    row.commentsAudience === undefined &&
    row.privateMessagesAudience === undefined &&
    row.notificationsEnabled === undefined
  ) {
    return null;
  }

  return {
    showInSearch,
    allowPrivateMessages,
    showFollowingList,
    commentsAudience,
    privateMessagesAudience,
    notificationsEnabled,
  };
}

function mergePrivacySettings(
  base: PrivacySettings,
  patch?: Partial<PrivacySettings> | null,
): PrivacySettings {
  return { ...base, ...patch };
}

function parseAccountSettings(data: unknown): AccountSettings | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  return {
    phone: typeof row.phone === 'string' ? row.phone : null,
    email: typeof row.email === 'string' ? row.email : null,
    birthDate:
      typeof row.birthDate === 'string' ? row.birthDate : null,
  };
}

export async function fetchPrivacySettings(
  userId?: string,
): Promise<PrivacySettings> {
  try {
    const res = await authFetch(`${API_BASE}/api/users/me/privacy`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (res.ok) {
      const json = await res.json();
      const parsed = parsePrivacySettings(json.data);
      if (parsed) return mergePrivacySettings(DEFAULT_PRIVACY_SETTINGS, parsed);
    }
  } catch {
    // fall through to profile fallback
  }

  if (userId) {
    try {
      const profile = await fetchUserProfile(userId);
      const parsed = parsePrivacySettings(profile);
      if (parsed) return mergePrivacySettings(DEFAULT_PRIVACY_SETTINGS, parsed);
    } catch {
      // ignore
    }
  }

  return DEFAULT_PRIVACY_SETTINGS;
}

export async function updatePrivacySettings(
  patch: Partial<PrivacySettings>,
  userId?: string,
  current: PrivacySettings = DEFAULT_PRIVACY_SETTINGS,
): Promise<{ settings: PrivacySettings | null; message?: string }> {
  try {
    const res = await authFetch(`${API_BASE}/api/users/me/privacy`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      const parsed = parsePrivacySettings(json.data);
      if (parsed) {
        return { settings: mergePrivacySettings(current, parsed) };
      }
    }
    if (!res.ok) {
      return {
        settings: null,
        message: json.messageAr ?? json.message ?? 'تعذّr حفظ الإعدادات',
      };
    }
  } catch {
    // fall through to profile update fallback
  }

  if (!userId) {
    return { settings: null, message: 'تعذّr الاتصال بالخادم' };
  }

  try {
    const res = await authFetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        settings: null,
        message: json.messageAr ?? json.message ?? 'تعذّr حفظ الإعدادات',
      };
    }
    const parsed = parsePrivacySettings(json.data);
    if (parsed) {
      return { settings: mergePrivacySettings(current, parsed) };
    }
    return { settings: mergePrivacySettings(current, patch) };
  } catch {
    return { settings: null, message: 'تعذّr الاتصال بالخادم' };
  }
}

export async function fetchAccountSettings(): Promise<AccountSettings | null> {
  try {
    const res = await authFetch(`${API_BASE}/api/users/me/account`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return parseAccountSettings(json.data);
  } catch {
    return null;
  }
}

export async function updateAccountSettings(
  patch: Partial<Pick<AccountSettings, 'email' | 'birthDate'>>,
  userId?: string,
): Promise<{ account: AccountSettings | null; message?: string }> {
  try {
    const res = await authFetch(`${API_BASE}/api/users/me/account`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    const account = parseAccountSettings(json.data);
    if (res.ok && account) return { account };
    if (!userId) {
      return {
        account: null,
        message: json.messageAr ?? json.message ?? 'تعذّr حفظ البيانات',
      };
    }
  } catch {
    if (!userId) return { account: null, message: 'تعذّr الاتصال بالخادم' };
  }

  if (!userId) return { account: null, message: 'تعذّr حفظ البيانات' };

  try {
    const res = await authFetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    const account = parseAccountSettings(json.data);
    if (res.ok && account) return { account };
    return {
      account: null,
      message: json.messageAr ?? json.message ?? 'تعذّr حفظ البيانات',
    };
  } catch {
    return { account: null, message: 'تعذّr الاتصال بالخادم' };
  }
}

/** Permanently delete (deactivate) the signed-in user's own account. */
export async function deleteAccount(
  userId: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!userId?.trim()) {
    return { ok: false, message: 'معرّف المستخدم غير صالح' };
  }
  try {
    const res = await authFetch(
      `${API_BASE}/api/users/${encodeURIComponent(userId.trim())}`,
      { method: 'DELETE' },
    );
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    if (res.ok && json.success !== false) {
      return { ok: true };
    }
    if (res.status === 401) {
      return { ok: false, message: 'يجب تسجيل الدخول' };
    }
    const message = await parseApiError(
      new Response(JSON.stringify(json), { status: res.status }),
    );
    return { ok: false, message };
  } catch {
    return { ok: false, message: 'تعذّر الاتصال بالخادم' };
  }
}

export async function changeAccountPhone(
  phone: string,
  phoneToken: string,
): Promise<{ account: AccountSettings | null; message?: string }> {
  try {
    const res = await authFetch(`${API_BASE}/api/users/me/phone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, phone_token: phoneToken }),
    });
    const json = await res.json().catch(() => ({}));
    const account = parseAccountSettings(json.data);
    if (res.ok && account) return { account };
    return {
      account: null,
      message: json.messageAr ?? json.message ?? 'تعذّr تحديث رقم الجوال',
    };
  } catch {
    return { account: null, message: 'تعذّr الاتصال بالخادم' };
  }
}

export type ConnectionsResult = {
  users: ConnectionUser[];
  hidden?: boolean;
};

export async function fetchUserConnections(
  userId: string,
  type: 'followers' | 'following',
): Promise<ConnectionUser[]> {
  const res = await authFetch(`${API_BASE}/api/users/${userId}/connections?type=${type}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) return [];
  const json = await res.json();
  if (!json.success || !json.data?.users) return [];
  if (
    !Array.isArray(json.data.users) ||
    json.data.users.some((user: { isFollowing?: unknown }) => typeof user.isFollowing !== 'boolean')
  ) {
    console.warn('[Follow] connections response omitted boolean isFollowing', {
      userId,
      type,
    });
    return [];
  }
  return json.data.users as ConnectionUser[];
}

export async function fetchUserConnectionsWithMeta(
  userId: string,
  type: 'followers' | 'following',
): Promise<ConnectionsResult> {
  const res = await authFetch(`${API_BASE}/api/users/${userId}/connections?type=${type}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) return { users: [] };
  const json = await res.json();
  if (!json.success || !json.data?.users) return { users: [] };
  if (
    !Array.isArray(json.data.users) ||
    json.data.users.some((user: { isFollowing?: unknown }) => typeof user.isFollowing !== 'boolean')
  ) {
    return { users: [] };
  }
  return {
    users: json.data.users as ConnectionUser[],
    hidden: json.data.hidden === true,
  };
}

export async function setFollowUser(
  userId: string,
  following: boolean,
): Promise<{ following: boolean } | null> {
  const res = await authFetch(`${API_BASE}/api/users/${userId}/follow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ following }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success) return null;
  if (typeof json.data?.following !== 'boolean') {
    console.warn('[Follow] mutation response omitted boolean following', { userId });
    return null;
  }
  return json.data as { following: boolean };
}

export type RateUserResult = {
  rating: number | null;
  reviewCount: number;
  myRating: number;
};

/** Rate another user's account (1–5 stars). One rating per reviewer — calling again edits it. */
export async function rateUser(userId: string, rating: number): Promise<RateUserResult | null> {
  const res = await authFetch(`${API_BASE}/api/users/${userId}/rate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success) return null;
  return json.data as RateUserResult;
}

export type BlockedUser = {
  id: string;
  username: string;
  displayName: string;
  arabicName: string;
  avatar?: string;
  verified: boolean;
  blockedAt: string;
};

export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
  const res = await authFetch(`${API_BASE}/api/users/blocked`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) return [];
  const json = await res.json();
  if (!json.success || !Array.isArray(json.data?.users)) return [];
  return json.data.users as BlockedUser[];
}

export async function setBlockUser(
  userId: string,
  blocked: boolean,
): Promise<BlockResult> {
  if (!userId?.trim()) {
    return { ok: false, message: 'معرّف المستخدم غير صالح' };
  }

  try {
    const res = await authFetch(`${API_BASE}/api/users/${encodeURIComponent(userId.trim())}/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocked }),
    });
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    if (res.ok && json.success !== false && typeof json.data?.blocked === 'boolean') {
      return { ok: true, blocked: json.data.blocked as boolean };
    }

    if (res.status === 401) {
      return { ok: false, message: 'يجب تسجيل الدخول' };
    }

    const message = await parseApiError(
      new Response(JSON.stringify(json), { status: res.status }),
    );
    return { ok: false, message };
  } catch {
    return { ok: false, message: 'تعذّr الاتصال بالخادم' };
  }
}
