import {
  DAFTRA_API_PREFIX,
  DAFTRA_DEFAULT_TIMEOUT_MS,
  type DaftraFailureReason,
} from './daftra.constants';
import { DaftraRequestError } from './daftra.errors';
import { redactSensitive } from '../utils/redact.util';

export type DaftraHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type DaftraClientOptions = {
  origin: string;
  /** API Key auth (header APIKEY). Mutually exclusive with accessToken at call time. */
  apiKey?: string;
  /** OAuth Bearer access token. */
  accessToken?: string;
  /**
   * Invoked at most once per request chain when Bearer auth receives 401/403.
   * Return a fresh access token to retry, or null to fail.
   */
  refreshAccessToken?: () => Promise<string | null>;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type DaftraHttpResponse<T = unknown> = {
  httpStatus: number;
  body: T;
};

function reasonFromHttpStatus(status: number | null): DaftraFailureReason {
  if (status === 401 || status === 403) return 'INVALID_API_KEY';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status && status >= 500) return 'UPSTREAM_ERROR';
  if (status === null) return 'CONNECTION_FAILED';
  return 'UPSTREAM_ERROR';
}

function safeMessage(reason: DaftraFailureReason): string {
  switch (reason) {
    case 'INVALID_API_KEY':
      return 'بيانات اعتماد دفترة غير صحيحة';
    case 'NOT_FOUND':
      return 'تعذر الوصول للمورد في دفترة';
    case 'RATE_LIMITED':
      return 'حساب دفترة رفض الطلب بسبب كثرة المحاولات';
    case 'UPSTREAM_ERROR':
      return 'خدمة دفترة غير متاحة حالياً';
    case 'INVALID_RESPONSE':
      return 'استجابة دفترة غير صالحة';
    default:
      return 'تعذر الاتصال بحساب دفترة';
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export class DaftraClient {
  private readonly origin: string;
  private apiKey: string | undefined;
  private accessToken: string | undefined;
  private readonly refreshAccessToken?: () => Promise<string | null>;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DaftraClientOptions) {
    this.origin = options.origin.replace(/\/$/, '');
    this.apiKey = options.apiKey?.trim() || undefined;
    this.accessToken = options.accessToken?.trim() || undefined;
    this.refreshAccessToken = options.refreshAccessToken;
    this.timeoutMs = options.timeoutMs ?? DAFTRA_DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    if (!this.apiKey && !this.accessToken) {
      throw new DaftraRequestError(
        'INVALID_API_KEY',
        'بيانات اعتماد دفترة غير صحيحة',
        null,
      );
    }
  }

  get<T = unknown>(
    path: string,
    query?: Record<string, string | number | undefined>,
  ) {
    return this.request<T>('GET', path, { query });
  }

  post<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('POST', path, { body });
  }

  put<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, { body });
  }

  patch<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, { body });
  }

  delete<T = unknown>(path: string) {
    return this.request<T>('DELETE', path);
  }

  async request<T = unknown>(
    method: DaftraHttpMethod,
    path: string,
    init: {
      query?: Record<string, string | number | undefined>;
      body?: unknown;
    } = {},
    alreadyRetried = false,
  ): Promise<DaftraHttpResponse<T>> {
    const url = this.buildUrl(path, init.query);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      // Daftra docs: do not send Authorization together with APIKEY.
      if (this.accessToken) {
        headers.Authorization = `Bearer ${this.accessToken}`;
      } else if (this.apiKey) {
        headers.APIKEY = this.apiKey;
      }
      const hasBody = init.body !== undefined;
      if (hasBody) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await this.fetchImpl(url, {
        method,
        headers,
        body: hasBody ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });

      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        throw new DaftraRequestError(
          'INVALID_RESPONSE',
          safeMessage('INVALID_RESPONSE'),
          response.status,
        );
      }

      void redactSensitive(parsed);

      const record = parsed as { result?: unknown; code?: unknown };
      const resultText =
        typeof record.result === 'string' ? record.result.toLowerCase() : '';
      const authRejected =
        response.status === 401 ||
        response.status === 403 ||
        Number(record.code) === 401;

      if (
        authRejected &&
        this.accessToken &&
        this.refreshAccessToken &&
        !alreadyRetried
      ) {
        const next = await this.refreshAccessToken();
        if (next?.trim()) {
          this.accessToken = next.trim();
          return this.request<T>(method, path, init, true);
        }
      }

      if (authRejected) {
        throw new DaftraRequestError(
          'INVALID_API_KEY',
          safeMessage('INVALID_API_KEY'),
          response.status,
        );
      }

      if (response.status < 200 || response.status >= 300) {
        const reason = reasonFromHttpStatus(response.status);
        throw new DaftraRequestError(
          reason,
          safeMessage(reason),
          response.status,
        );
      }

      // Daftra returns both "success" and "successful" depending on endpoint/tenant.
      if (
        resultText &&
        resultText !== 'success' &&
        resultText !== 'successful'
      ) {
        throw new DaftraRequestError(
          'UPSTREAM_ERROR',
          safeMessage('UPSTREAM_ERROR'),
          response.status,
        );
      }

      return { httpStatus: response.status, body: parsed as T };
    } catch (err) {
      if (err instanceof DaftraRequestError) throw err;
      if (isAbortError(err)) {
        throw new DaftraRequestError(
          'CONNECTION_FAILED',
          'انتهت مهلة الاتصال بدفترة',
          null,
        );
      }
      throw new DaftraRequestError(
        'CONNECTION_FAILED',
        safeMessage('CONNECTION_FAILED'),
        null,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.origin}${DAFTRA_API_PREFIX}${normalized}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === '') continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}
