import { normalizeLoginIdentifier } from '@/lib/login-identifier';
import { apiClient, unwrap } from './api.client';
import {
  ACCESS_TOKEN_KEY,
  BUTCHER_KEY,
  REFRESH_TOKEN_KEY,
  SESSION_COOKIE,
  USER_KEY,
  getApiErrorMessage,
  isNoButcherProfileError,
} from './api.client';
import { fetchMyButcher, type ButcherProfile } from './butcher.service';

export type AuthUser = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  arabicName: string;
  avatar: string | null;
  role: string;
};

export type LoginResult = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
};

const SESSION_COOKIE_MAX_AGE = 60 * 60 * 12;

export const NO_BUTCHER_MESSAGE = 'هذا الحساب غير مرتبط بملحمة معتمدة';

export function setSessionCookie(accessToken: string) {
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(accessToken)}; path=/; max-age=${SESSION_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function persistTokens(data: LoginResult) {
  localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  setSessionCookie(data.accessToken);
}

export function persistButcher(butcher: ButcherProfile) {
  localStorage.setItem(BUTCHER_KEY, JSON.stringify(butcher));
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(BUTCHER_KEY);
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
}

export async function platformLogin(login: string, password: string): Promise<LoginResult> {
  const res = await apiClient.post('/auth/login', {
    login: normalizeLoginIdentifier(login),
    password,
  });
  return unwrap<LoginResult>(res);
}

export async function loginAndRequireButcher(login: string, password: string): Promise<{
  session: LoginResult;
  butcher: ButcherProfile;
}> {
  const session = await platformLogin(login, password);
  persistTokens(session);
  try {
    const butcher = await fetchMyButcher();
    persistButcher(butcher);
    return { session, butcher };
  } catch (error) {
    await logoutQuietly();
    if (isNoButcherProfileError(error)) {
      throw new Error(NO_BUTCHER_MESSAGE);
    }
    throw new Error(getApiErrorMessage(error, NO_BUTCHER_MESSAGE));
  }
}

export async function logoutQuietly() {
  const token = typeof window !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
  const refreshToken =
    typeof window !== 'undefined' ? localStorage.getItem(REFRESH_TOKEN_KEY) : null;
  try {
    if (token) {
      await apiClient.post('/auth/logout', { refreshToken: refreshToken ?? undefined });
    }
  } catch {
    /* still clear locally */
  }
  clearSession();
}

export async function tryRestoreSession(): Promise<
  'restored' | 'none' | 'cleared' | 'no_butcher'
> {
  if (typeof window === 'undefined') return 'none';

  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) {
    document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
    return 'none';
  }

  setSessionCookie(token);
  try {
    const butcher = await fetchMyButcher();
    persistButcher(butcher);
    return 'restored';
  } catch (error) {
    clearSession();
    if (isNoButcherProfileError(error)) return 'no_butcher';
    return 'cleared';
  }
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function getStoredButcher(): ButcherProfile | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(BUTCHER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ButcherProfile;
  } catch {
    return null;
  }
}
