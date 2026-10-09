/**
 * Admin panel session cookies.
 *
 * The admin panel (same origin as /api behind nginx) authenticates with an
 * HttpOnly + Secure + SameSite=Strict cookie set by the backend, so the access
 * token is never readable from JavaScript. The mobile app keeps using
 * `Authorization: Bearer` and is unaffected: the cookie fallback is only
 * honoured for staff roles and only when the request carries the panel's
 * `X-Requested-With: sarh-admin` header (CSRF defence in depth on top of
 * SameSite=Strict).
 */

/** Read by the Next.js admin middleware too — keep the name stable. */
export const ADMIN_ACCESS_COOKIE = 'admin_token';
export const ADMIN_REFRESH_COOKIE = 'admin_refresh';
/** Refresh cookie is only ever sent to the admin auth endpoints. */
export const ADMIN_REFRESH_COOKIE_PATH = '/api/admin/auth';
export const ADMIN_CSRF_HEADER = 'x-requested-with';
export const ADMIN_CSRF_VALUE = 'sarh-admin';
/** Idle timeout of a panel session (refresh cookie lifetime, sliding). */
export const ADMIN_SESSION_IDLE_SEC = 12 * 60 * 60;

const STAFF_ROLES = new Set(['ADMIN', 'MODERATOR']);

export function isStaffRole(role: unknown): boolean {
  return typeof role === 'string' && STAFF_ROLES.has(role);
}

export function parseCookieHeader(
  header: string | string[] | undefined,
): Record<string, string> {
  const raw = Array.isArray(header) ? header.join('; ') : header;
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name || name in out) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export function readCookie(
  header: string | string[] | undefined,
  name: string,
): string | undefined {
  const value = parseCookieHeader(header)[name];
  return value ? value : undefined;
}

/** True when the request comes from the admin panel's API client. */
export function hasAdminCsrfHeader(
  headers: Record<string, string | string[] | undefined>,
): boolean {
  const v = headers[ADMIN_CSRF_HEADER];
  const value = Array.isArray(v) ? v[0] : v;
  return typeof value === 'string' && value.toLowerCase() === ADMIN_CSRF_VALUE;
}

type RequestLike = {
  secure?: boolean;
  headers: Record<string, string | string[] | undefined>;
};

/** Secure flag: always in production, otherwise only on HTTPS (local dev). */
export function shouldUseSecureCookie(req: RequestLike): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  return (Array.isArray(proto) ? proto[0] : proto) === 'https';
}

export function serializeCookie(
  name: string,
  value: string,
  opts: { maxAgeSec: number; path: string; secure: boolean },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path}`,
    `Max-Age=${Math.max(0, Math.floor(opts.maxAgeSec))}`,
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (opts.maxAgeSec <= 0) {
    parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  }
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

/** Seconds until a JWT's `exp` (0 when missing/expired/malformed). */
export function secondsUntilJwtExpiry(token: string, nowMs = Date.now()): number {
  const payload = token.split('.')[1];
  if (!payload) return 0;
  try {
    const json = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { exp?: number };
    const exp = Number(json.exp);
    if (!Number.isFinite(exp)) return 0;
    return Math.max(0, Math.floor(exp - nowMs / 1000));
  } catch {
    return 0;
  }
}

export function buildAdminSessionCookies(
  tokens: { accessToken: string; refreshToken: string },
  secure: boolean,
): string[] {
  return [
    serializeCookie(ADMIN_ACCESS_COOKIE, tokens.accessToken, {
      maxAgeSec: secondsUntilJwtExpiry(tokens.accessToken),
      path: '/',
      secure,
    }),
    serializeCookie(ADMIN_REFRESH_COOKIE, tokens.refreshToken, {
      maxAgeSec: ADMIN_SESSION_IDLE_SEC,
      path: ADMIN_REFRESH_COOKIE_PATH,
      secure,
    }),
  ];
}

export function buildClearAdminSessionCookies(secure: boolean): string[] {
  return [
    serializeCookie(ADMIN_ACCESS_COOKIE, '', {
      maxAgeSec: 0,
      path: '/',
      secure,
    }),
    serializeCookie(ADMIN_REFRESH_COOKIE, '', {
      maxAgeSec: 0,
      path: ADMIN_REFRESH_COOKIE_PATH,
      secure,
    }),
  ];
}
