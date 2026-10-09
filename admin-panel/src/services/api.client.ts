import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { withAdminBase } from '@/constants/adminBasePath';

const SERVER_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Browser uses same-origin /api (proxied by next.config rewrites) to avoid CORS. */
export const API_URL =
  typeof window !== 'undefined' ? '' : SERVER_API_URL;

export const apiClient = axios.create({
  baseURL: typeof window !== 'undefined' ? '/api' : `${SERVER_API_URL}/api`,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

export type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  messageAr?: string;
  timestamp?: string;
};

/**
 * Auth: the backend sets an HttpOnly + Secure + SameSite=Strict session cookie
 * (`admin_token`) on login/refresh, so no token is ever readable from JS.
 * `X-Requested-With: sarh-admin` marks panel requests — the backend only
 * honours the cookie when it is present (CSRF defence in depth).
 */
apiClient.defaults.withCredentials = true;
apiClient.defaults.headers.common['X-Requested-With'] = 'sarh-admin';

/** Legacy localStorage keys from the pre-cookie panel (cleaned up on sight). */
const LEGACY_TOKEN_KEYS = ['admin_access_token', 'admin_refresh_token'];

export function clearLocalAdminState() {
  if (typeof window === 'undefined') return;
  for (const key of LEGACY_TOKEN_KEYS) localStorage.removeItem(key);
  localStorage.removeItem('admin_user');
}

const AUTH_ENDPOINTS = ['/admin/auth/login', '/admin/auth/refresh', '/admin/auth/logout'];

function isAuthEndpoint(url: string | undefined): boolean {
  return !!url && AUTH_ENDPOINTS.some((p) => url.endsWith(p));
}

let refreshInFlight: Promise<boolean> | null = null;

/** Rotate the session cookie once; concurrent callers share the same request. */
export function refreshAdminSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = apiClient
      .post('/admin/auth/refresh')
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function redirectToLogin() {
  clearLocalAdminState();
  const loginPath = withAdminBase('/login');
  if (!window.location.pathname.startsWith(loginPath)) {
    window.location.href = loginPath;
  }
}

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiEnvelope<unknown>>) => {
    const config = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      if (config && !config._retried && !isAuthEndpoint(config.url)) {
        config._retried = true;
        if (await refreshAdminSession()) {
          return apiClient.request(config);
        }
      }
      if (!isAuthEndpoint(config?.url)) redirectToLogin();
    }
    return Promise.reject(error);
  },
);

/** Backend error code (e.g. `otp_required`) from an API error, if any. */
export function getApiErrorCode(error: unknown): string | undefined {
  if (axios.isAxiosError<ApiEnvelope<unknown>>(error)) {
    return error.response?.data?.error;
  }
  return undefined;
}

export function unwrap<T>(res: { data: ApiEnvelope<T> }): T {
  const body = res.data;
  if (!body.success || body.data === undefined) {
    throw new Error(body.messageAr ?? body.error ?? 'خطأ في الخادم');
  }
  return body.data;
}

export function getApiErrorMessage(error: unknown, fallback = 'خطأ في الخادم'): string {
  if (axios.isAxiosError<ApiEnvelope<unknown>>(error)) {
    if (!error.response) {
      return 'تعذّر الاتصال بالخادم';
    }
    if (error.response.status === 429) {
      return (
        error.response.data?.messageAr ??
        'طلبات كثيرة جداً، حاول بعد قليل'
      );
    }
    if (error.response.status >= 500 && !error.response.data?.messageAr) {
      return 'الخادم غير متاح  ';
    }
    return (
      error.response.data?.messageAr ??
      error.response.data?.error ??
      error.message ??
      fallback
    );
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
