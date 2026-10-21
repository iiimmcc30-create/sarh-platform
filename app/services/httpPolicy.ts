/**
 * Timeout and retry policy for the shared app HTTP client.
 * Idempotent reads (GET/HEAD) may be retried. Mutations and uploads are not.
 */

export const LIST_GET_TIMEOUT_MS = 15_000;
export const DEFAULT_TIMEOUT_MS = 60_000;
export const UPLOAD_TIMEOUT_MS = 120_000;

/** List/feed reads: initial try + 2 retries. Other reads: one retry. */
export const LIST_GET_MAX_ATTEMPTS = 3;
export const OTHER_GET_MAX_ATTEMPTS = 2;

const RETRY_BASE_MS = 300;
const RETRY_CAP_MS = 2_500;

const RETRY_STATUSES = new Set([408, 500, 502, 503, 504]);

export function httpMethod(method: string | undefined): string {
  return (method ?? 'GET').toUpperCase();
}

export function isIdempotentRead(method: string | undefined): boolean {
  const m = httpMethod(method);
  return m === 'GET' || m === 'HEAD';
}

function pathOf(url: string): string {
  const noHash = url.split('#')[0] ?? url;
  return noHash.split('?')[0] ?? noHash;
}

/** Collection / feed GETs that should fail fast on a weak radio. */
export function isListOrFeedGet(url: string, method: string | undefined): boolean {
  if (!isIdempotentRead(method)) return false;
  const path = pathOf(url);
  if (/\/api\/listings\/?$/.test(path)) return true;
  if (/\/api\/listings\/(?:boost\/plans|promotion\/plans|promote\/quote)(?:\/|$)/.test(path)) {
    return true;
  }
  if (/\/api\/posts\/?$/.test(path)) return true;
  if (/\/api\/home(?:\/|$)/.test(path)) return true;
  if (/\/api\/search(?:\/|$)/.test(path)) return true;
  if (/\/api\/categories(?:\/|$)/.test(path)) return true;
  if (/\/api\/stories\/?$/.test(path) || /\/api\/stories\/feed\/?$/.test(path)) return true;
  if (/\/api\/editorial-stories(?:\/|$)/.test(path)) return true;
  if (/\/api\/feed-suppliers(?:\/|$)/.test(path)) return true;
  if (/\/api\/explore-sarh-banners(?:\/|$)/.test(path)) return true;
  if (/\/api\/plans(?:\/|$)/.test(path)) return true;
  if (/\/api\/livestreams\/?$/.test(path)) return true;
  if (/\/api\/services\/?$/.test(path)) return true;
  if (/\/api\/support\/(?:meta|faqs|status)(?:\/|$)/.test(path)) return true;
  if (/\/api\/content(?:\/|$)/.test(path)) return true;
  if (/\/api\/notifications(?:\/|$)/.test(path)) return true;
  if (/\/api\/messages\/?$/.test(path)) return true;
  if (/\/api\/users\/suggested(?:\/|$)/.test(path)) return true;
  return false;
}

export function isUploadRequest(url: string, method: string | undefined): boolean {
  const m = httpMethod(method);
  if (m === 'GET' || m === 'HEAD') return false;
  if (/\/api\/upload(?:\/|$|\?)/.test(url)) return true;
  if (/cloudinary\.com/i.test(url) && /\/upload/i.test(url)) return true;
  if (/amazonaws\.com|r2\.cloudflarestorage\.com|backblazeb2\.com|X-Amz-Signature/i.test(url)) {
    return true;
  }
  if (m === 'PUT') return true;
  return false;
}

export function resolveTimeoutMs(
  url: string,
  method: string | undefined,
  explicit?: number,
): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  if (isUploadRequest(url, method)) return UPLOAD_TIMEOUT_MS;
  if (isListOrFeedGet(url, method)) return LIST_GET_TIMEOUT_MS;
  return DEFAULT_TIMEOUT_MS;
}

export function maxAttemptsFor(url: string, method: string | undefined): number {
  if (!isIdempotentRead(method)) return 1;
  return isListOrFeedGet(url, method) ? LIST_GET_MAX_ATTEMPTS : OTHER_GET_MAX_ATTEMPTS;
}

/** True for transient statuses on an idempotent read. 429 is not retried (the app already backs off). */
export function shouldRetryStatus(method: string | undefined, status: number): boolean {
  if (!isIdempotentRead(method)) return false;
  return RETRY_STATUSES.has(status);
}

export function isCallerAbort(error: unknown, callerSignal?: AbortSignal | null): boolean {
  if (callerSignal?.aborted) return true;
  return error instanceof Error && error.name === 'AbortError';
}

export function shouldRetryError(
  method: string | undefined,
  error: unknown,
  callerSignal?: AbortSignal | null,
): boolean {
  if (!isIdempotentRead(method)) return false;
  if (callerSignal?.aborted) return false;
  if (!(error instanceof Error)) return true;
  if (error.name === 'AbortError') return false;
  return true;
}

/**
 * Exponential backoff with full-ish jitter.
 * attemptIndex 0 is the first retry (after the initial failure).
 */
export function retryDelayMs(attemptIndex: number, random: number = Math.random()): number {
  const exp = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** Math.max(0, attemptIndex));
  const unit = Math.min(1, Math.max(0, random));
  const jitter = Math.floor(unit * exp * 0.5);
  return Math.round(exp * 0.5) + jitter;
}
