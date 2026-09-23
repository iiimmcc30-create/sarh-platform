/**
 * Classify /api/auth/refresh outcomes so AuthContext can clear only
 * definitive auth failures — not transient network/5xx errors.
 */

export type RefreshOutcome =
  | { kind: 'success'; accessToken: string; refreshToken?: string }
  | { kind: 'definitive_failure'; reason: string }
  | { kind: 'transient_failure'; reason: string };

const DEFINITIVE_STATUS = new Set([401, 403, 400]);
const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const DEFINITIVE_ERROR_CODES = new Set([
  'invalid_refresh',
  'session_expired',
  'token_reuse',
  'account_disabled',
  'unauthorized',
  'forbidden',
]);

function asRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function unwrapData(body: unknown): Record<string, unknown> | null {
  const root = asRecord(body);
  if (!root) return null;
  if (root.success === true && root.data && typeof root.data === 'object') {
    return asRecord(root.data);
  }
  return root;
}

export function evaluateRefreshResult(input: {
  networkError?: boolean;
  status?: number;
  body?: unknown;
}): RefreshOutcome {
  if (input.networkError) {
    return { kind: 'transient_failure', reason: 'network' };
  }

  const status = input.status ?? 0;
  if (status === 0) {
    return { kind: 'transient_failure', reason: 'no_status' };
  }

  if (TRANSIENT_STATUS.has(status) || status >= 500) {
    return { kind: 'transient_failure', reason: `http_${status}` };
  }

  if (DEFINITIVE_STATUS.has(status)) {
    return { kind: 'definitive_failure', reason: `http_${status}` };
  }

  if (status !== 200 && status !== 201) {
    return { kind: 'transient_failure', reason: `http_${status}` };
  }

  const data = unwrapData(input.body);
  const errorCode =
    (asRecord(input.body)?.error as string | undefined) ??
    (data?.error as string | undefined);
  if (errorCode && DEFINITIVE_ERROR_CODES.has(String(errorCode))) {
    return { kind: 'definitive_failure', reason: String(errorCode) };
  }

  const access =
    (data?.access_token as string | undefined) ??
    (data?.accessToken as string | undefined);
  if (!access || typeof access !== 'string') {
    return { kind: 'definitive_failure', reason: 'malformed_response' };
  }

  const refresh =
    (data?.refresh_token as string | undefined) ??
    (data?.refreshToken as string | undefined);

  return {
    kind: 'success',
    accessToken: access,
    refreshToken: typeof refresh === 'string' ? refresh : undefined,
  };
}

/** Missing refresh token cannot be validated — treat as definitive logout. */
export function evaluatePersistedTokens(input: {
  accessToken: string | null | undefined;
  refreshToken: string | null | undefined;
}): 'empty' | 'complete' | 'missing_refresh' {
  if (!input.accessToken) return 'empty';
  if (!input.refreshToken) return 'missing_refresh';
  return 'complete';
}

/** Bound AuthGuard stale authenticated state (7 days without a successful refresh). */
export const MAX_STALE_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export function isSessionStillTrusted(
  lastAuthOkAtMs: number | null | undefined,
  now = Date.now(),
): boolean {
  if (lastAuthOkAtMs == null || !Number.isFinite(lastAuthOkAtMs)) return false;
  return now - lastAuthOkAtMs <= MAX_STALE_SESSION_MS;
}
