import { apiClient, clearLocalAdminState, refreshAdminSession, unwrap } from './api.client';

export type AdminUser = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  arabicName: string;
  avatar: string | null;
  role: 'ADMIN' | 'MODERATOR';
};

/** The session itself lives in HttpOnly cookies; the body only carries the profile. */
export type LoginResult = {
  user: AdminUser;
};

export async function adminLogin(
  login: string,
  password: string,
  otp?: string,
): Promise<LoginResult> {
  const body: Record<string, string> = { login, password };
  if (otp?.trim()) body.otp = otp.trim();
  const res = await apiClient.post('/admin/auth/login', body);
  return unwrap<LoginResult>(res);
}

export async function adminMe(): Promise<{ user: AdminUser }> {
  const res = await apiClient.get('/admin/auth/me');
  return unwrap(res);
}

/** Store the (non-secret) profile for the sidebar; tokens never touch JS. */
export function persistSession(data: LoginResult) {
  clearLocalAdminState();
  localStorage.setItem('admin_user', JSON.stringify(data.user));
}

export function clearSession() {
  clearLocalAdminState();
}

/** Server logout: revokes the session and clears the HttpOnly cookies. */
export async function adminLogout(): Promise<void> {
  try {
    await apiClient.post('/admin/auth/logout');
  } catch {
    /* cookies may already be gone */
  } finally {
    clearSession();
  }
}

/**
 * Validate the cookie session (refreshing it once if the access cookie
 * expired). Without a stored profile there is nothing to restore.
 */
export async function tryRestoreSession(): Promise<'restored' | 'none' | 'cleared'> {
  if (typeof window === 'undefined') return 'none';
  if (!localStorage.getItem('admin_user')) {
    clearLocalAdminState();
    return 'none';
  }
  try {
    const { user } = await adminMe();
    localStorage.setItem('admin_user', JSON.stringify(user));
    return 'restored';
  } catch {
    if (await refreshAdminSession()) {
      try {
        const { user } = await adminMe();
        localStorage.setItem('admin_user', JSON.stringify(user));
        return 'restored';
      } catch {
        /* fall through */
      }
    }
    clearSession();
    return 'cleared';
  }
}

const KEEP_ALIVE_MS = 10 * 60 * 1000;

/**
 * Rotate the short-lived access cookie before it expires while the panel is
 * open, so page navigations (checked by the Next middleware) keep working.
 */
export function startSessionKeepAlive(): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const id = window.setInterval(() => {
    if (document.visibilityState === 'visible') void refreshAdminSession();
  }, KEEP_ALIVE_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') void refreshAdminSession();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.clearInterval(id);
    document.removeEventListener('visibilitychange', onVisible);
  };
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

// ─── Two-factor (TOTP) ───────────────────────────────────────────────────────

export type TwoFactorStatus = { enabled: boolean; pending: boolean };

export async function fetchTwoFactorStatus(): Promise<TwoFactorStatus> {
  return unwrap(await apiClient.get('/admin/auth/2fa'));
}

export async function startTwoFactorSetup(): Promise<{ secret: string; otpauthUrl: string }> {
  return unwrap(await apiClient.post('/admin/auth/2fa/setup'));
}

export async function enableTwoFactor(code: string): Promise<{ enabled: true }> {
  return unwrap(await apiClient.post('/admin/auth/2fa/enable', { code }));
}

export async function disableTwoFactor(code: string): Promise<{ enabled: false }> {
  return unwrap(await apiClient.post('/admin/auth/2fa/disable', { code }));
}
