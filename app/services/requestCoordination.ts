/**
 * Shared client request coordination: in-flight dedupe + HTTP 429 backoff.
 * Keeps existing data on rate limits; no React Query/SWR.
 */

const inflight = new Map<string, Promise<unknown>>();

/** Global pause after 429 so unrelated feed callers wait instead of storming. */
let rateLimitedUntilMs = 0;

export function resetRequestCoordination() {
  inflight.clear();
  rateLimitedUntilMs = 0;
}

export function getRateLimitedUntil(): number {
  return rateLimitedUntilMs;
}

export function isRateLimited(now = Date.now()): boolean {
  return now < rateLimitedUntilMs;
}

export function msUntilRateLimitClears(now = Date.now()): number {
  return Math.max(0, rateLimitedUntilMs - now);
}

export function noteRateLimited(untilMs: number) {
  if (untilMs > rateLimitedUntilMs) rateLimitedUntilMs = untilMs;
}

export function parseRetryAfterMs(
  header: string | null | undefined,
  bodyRetry?: unknown,
  fallbackMs = 60_000,
): number {
  if (header) {
    const asInt = parseInt(header, 10);
    if (!Number.isNaN(asInt) && asInt > 0) return asInt * 1000;
    const asDate = Date.parse(header);
    if (!Number.isNaN(asDate)) return Math.max(1000, asDate - Date.now());
  }
  if (typeof bodyRetry === 'number' && bodyRetry > 0) {
    // API may send seconds or ms; treat small values as seconds.
    return bodyRetry < 1000 ? bodyRetry * 1000 : bodyRetry;
  }
  return fallbackMs;
}

export function noteRateLimitFromResponse(
  res: { status: number; headers: { get(name: string): string | null } },
  body?: { retryAfter?: unknown },
  fallbackMs = 60_000,
): number | null {
  if (res.status !== 429) return null;
  const waitMs = parseRetryAfterMs(res.headers.get('Retry-After'), body?.retryAfter, fallbackMs);
  noteRateLimited(Date.now() + waitMs);
  return waitMs;
}

/**
 * If the same key is already running, await that promise instead of starting another.
 */
export function dedupeInflight<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = factory().finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

/**
 * Deduped GET that materializes the body once so every waiter can read JSON safely.
 *
 * IMPORTANT: clone via UTF-8 **text**, never via ArrayBuffer.
 * React Native's whatwg-fetch polyfill decodes ArrayBuffer bodies with
 * `String.fromCharCode` (latin1), which turns Arabic UTF-8 into Mojibake (Ø§…).
 * Detail screens use a fresh fetch().json() and were unaffected; list/feed
 * paths go through fetchPublicFeed → dedupeGetResponse and were corrupted.
 */
export async function dedupeGetResponse(
  key: string,
  factory: () => Promise<Response>,
): Promise<Response> {
  const shared = await dedupeInflight(key, async () => {
    const res = await factory();
    const text = await res.text();
    return {
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      headers: res.headers,
      text,
    };
  });

  return new Response(shared.text, {
    status: shared.status,
    statusText: shared.statusText,
    headers: shared.headers,
  });
}

/** True when a previous success is still within TTL and the caller did not force. */
export function shouldReuseFreshResult(
  lastSuccessAt: number | undefined,
  ttlMs: number,
  force = false,
  now = Date.now(),
): boolean {
  if (force) return false;
  return Boolean(lastSuccessAt && now - lastSuccessAt < ttlMs);
}

/** Monotonic token so an older in-flight response cannot apply after a newer one. */
export function createRequestGeneration() {
  let generation = 0;
  return {
    next() {
      generation += 1;
      return generation;
    },
    isCurrent(token: number) {
      return token === generation;
    },
  };
}

/** Exponential backoff delay (ms), capped; respects active 429 window. */
export function feedRetryDelayMs(attempt: number, baseMs = 3_000, capMs = 60_000): number {
  const exp = Math.min(capMs, baseMs * Math.pow(2, Math.max(0, attempt)));
  return Math.max(exp, msUntilRateLimitClears());
}
