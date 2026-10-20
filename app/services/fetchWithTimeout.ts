import { resolveRequestUrl } from '@/services/apiFallback';
import {
  isIdempotentRead,
  maxAttemptsFor,
  resolveTimeoutMs,
  retryDelayMs,
  shouldRetryError,
  shouldRetryStatus,
} from '@/services/httpPolicy';

export type FetchClientOptions = {
  timeoutMs?: number;
  /** Default true for GET/HEAD. Pass false for probes that must not be repeated. */
  retry?: boolean;
};

function timeoutAmount(timeoutOrOptions?: number | FetchClientOptions): number | undefined {
  if (typeof timeoutOrOptions === 'number') return timeoutOrOptions;
  return timeoutOrOptions?.timeoutMs;
}

function retryAllowed(
  timeoutOrOptions: number | FetchClientOptions | undefined,
  method: string,
): boolean {
  if (typeof timeoutOrOptions === 'object' && timeoutOrOptions?.retry === false) return false;
  if (typeof timeoutOrOptions === 'object' && timeoutOrOptions?.retry === true) {
    return isIdempotentRead(method);
  }
  return isIdempotentRead(method);
}

function fastRetry(): boolean {
  return (globalThis as { __SARH_HTTP_FAST_RETRY__?: boolean }).__SARH_HTTP_FAST_RETRY__ === true;
}

function sleep(ms: number, caller?: AbortSignal | null): Promise<void> {
  if (fastRetry() || ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (caller?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      caller?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    caller?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(): Error {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}

function asTimeoutError(): Error {
  const timeoutErr = new Error('Request timed out');
  timeoutErr.name = 'TimeoutError';
  return timeoutErr;
}

async function fetchOnce(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const caller = init.signal ?? null;
  const signals = [timeoutController.signal, caller].filter((s): s is AbortSignal => !!s);
  const signal = mergeSignals(signals);
  try {
    return await fetch(url, { ...init, signal });
  } catch (err) {
    if (caller?.aborted) throw err;
    if (timeoutController.signal.aborted) throw asTimeoutError();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function mergeSignals(signals: AbortSignal[]): AbortSignal {
  if (signals.length === 1) return signals[0];
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  return controller.signal;
}

/**
 * Single HTTP client for the app: dev-base rebasing, a deadline, and
 * exponential backoff with jitter for idempotent GET/HEAD only.
 *
 * The third argument stays a timeout number for existing callers. Pass
 * `{ timeoutMs, retry: false }` when a call must not be repeated.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutOrOptions?: number | FetchClientOptions,
): Promise<Response> {
  const url = await resolveRequestUrl(input);
  const method = (init.method ?? 'GET').toUpperCase();
  const timeoutMs = resolveTimeoutMs(url, method, timeoutAmount(timeoutOrOptions));
  const attempts = retryAllowed(timeoutOrOptions, method)
    ? maxAttemptsFor(url, method)
    : 1;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(retryDelayMs(attempt - 1), init.signal);
    }
    try {
      const res = await fetchOnce(url, init, timeoutMs);
      if (attempt < attempts - 1 && shouldRetryStatus(method, res.status)) {
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < attempts - 1 && shouldRetryError(method, err, init.signal)) {
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed');
}

/** Same client. Prefer this name at new call sites. */
export const apiFetch = fetchWithTimeout;
