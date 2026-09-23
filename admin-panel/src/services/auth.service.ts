import { apiClient, unwrap } from './api.client';

export type AdminUser = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  arabicName: string;
  avatar: string | null;
  role: 'ADMIN' | 'MODERATOR';
};

export type LoginResult = {
  user: AdminUser;
  accessToken: string;
  refreshToken: string;
};

export async function adminLogin(login: string, password: string): Promise<LoginResult> {
  const res = await apiClient.post('/admin/auth/login', { login, password });
  return unwrap<LoginResult>(res);
}

export async function adminMe(): Promise<{ user: AdminUser }> {
  const res = await apiClient.get('/admin/auth/me');
  return unwrap(res);
}

const SESSION_COOKIE_MAX_AGE = 60 * 60 * 12;

export function setSessionCookie(accessToken: string) {
  document.cookie = `admin_token=${encodeURIComponent(accessToken)}; path=/; max-age=${SESSION_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function persistSession(data: LoginResult) {
  localStorage.setItem('admin_access_token', data.accessToken);
  localStorage.setItem('admin_refresh_token', data.refreshToken);
  localStorage.setItem('admin_user', JSON.stringify(data.user));
  setSessionCookie(data.accessToken);
}

export function clearSession() {
  localStorage.removeItem('admin_access_token');
  localStorage.removeItem('admin_refresh_token');
  localStorage.removeItem('admin_user');
  document.cookie = 'admin_token=; path=/; max-age=0';
}

/** Validate stored token, sync cookie, or clear broken session. */
export async function tryRestoreSession(): Promise<'restored' | 'none' | 'cleared'> {
  if (typeof window === 'undefined') return 'none';

  const token = localStorage.getItem('admin_access_token');
  if (!token) {
    document.cookie = 'admin_token=; path=/; max-age=0';
    return 'none';
  }

  setSessionCookie(token);
  try {
    const { user } = await adminMe();
    localStorage.setItem('admin_user', JSON.stringify(user));
    return 'restored';
  } catch {
    clearSession();
    return 'cleared';
  }
}

export function getStoredUser(): AdminUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('admin_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminUser;
  } catch {
    return null;
  }
}
