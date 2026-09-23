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

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('admin_access_token');
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
      localStorage.removeItem('admin_access_token');
      localStorage.removeItem('admin_refresh_token');
      localStorage.removeItem('admin_user');
      document.cookie = 'admin_token=; path=/; max-age=0';
      const loginPath = withAdminBase('/login');
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
