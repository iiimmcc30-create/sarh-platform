// Authenticated fetch — attaches Bearer token and retries once after refresh on 401.

import { fetchWithTimeout } from '@/services/fetchWithTimeout';

type AuthFetchDeps = {
  getToken: () => string | null;
  refresh: () => Promise<boolean>;
};

let deps: AuthFetchDeps | null = null;

const DEFAULT_TIMEOUT_MS = 60_000;

export function registerAuthFetch(next: AuthFetchDeps) {
  deps = next;
}

/** Latest access token from AuthProvider (avoids stale closures during uploads). */
export function getAccessToken(): string | null {
  return deps?.getToken() ?? null;
}

export async function authFetch(
  input: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const token = deps?.getToken() ?? null;
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res = await fetchWithTimeout(input, { ...init, headers }, timeoutMs);

  if (res.status !== 401 || !deps) return res;

  // Another request already rotated the session while this one was in flight:
  // retry with the new access token instead of rotating again. Concurrent 401s
  // otherwise share AuthContext's single in-flight refresh.
  const current = deps.getToken();
  const alreadyRotated = !!current && current !== token;
  if (!alreadyRotated) {
    const refreshed = await deps.refresh();
    if (!refreshed) return res;
  }

  const newToken = deps.getToken();
  if (!newToken) return res;

  const retryHeaders = new Headers(init.headers);
  retryHeaders.set('Authorization', `Bearer ${newToken}`);
  return fetchWithTimeout(input, { ...init, headers: retryHeaders }, timeoutMs);
}
