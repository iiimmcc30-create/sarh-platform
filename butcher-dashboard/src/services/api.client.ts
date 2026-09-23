import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { withButcherBase } from '@/constants/butcherBasePath';

const SERVER_API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001')
  .trim()
  .replace(/^['"]|['"]$/g, '');

export const ACCESS_TOKEN_KEY = 'butcher_access_token';
export const REFRESH_TOKEN_KEY = 'butcher_refresh_token';
export const USER_KEY = 'butcher_user';
export const BUTCHER_KEY = 'butcher_profile';
export const SESSION_COOKIE = 'butcher_token';

/** Browser uses same-origin /api (proxied by next.config rewrites) to avoid CORS. */
export const apiClient = axios.create({
  baseURL: typeof window !== 'undefined' ? '/api' : `${SERVER_API_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
});

export type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  messageAr?: string;
  timestamp?: string;
};

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (error: AxiosError<ApiEnvelope<unknown>>) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(BUTCHER_KEY);
      document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
      const loginPath = withButcherBase('/login');
      if (!window.location.pathname.startsWith(loginPath)) {
        window.location.href = loginPath;
      }
    }
    return Promise.reject(error);
  },
);

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
    if (error.response.status >= 500 && !error.response.data?.messageAr) {
      return 'الخادم غير متاح';
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

export function isNoButcherProfileError(error: unknown): boolean {
  if (!axios.isAxiosError<ApiEnvelope<unknown>>(error)) return false;
  const status = error.response?.status;
  const code = error.response?.data?.error;
  return status === 404 && (code === 'not_found' || !code);
}
