import { resolveRequestUrl } from '@/services/apiFallback';

/** Default ceiling for uploads / slow mutations; feed GETs pass a shorter timeout. */
const DEFAULT_TIMEOUT_MS = 60_000;

export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  // Dev only: a request built from an unreachable local base goes to production instead.
  const url = await resolveRequestUrl(input);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      const timeoutErr = new Error('Request timed out');
      timeoutErr.name = 'TimeoutError';
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
