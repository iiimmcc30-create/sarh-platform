import { createHash } from 'crypto';

/**
 * Per-account admin login lockout (on top of the per-IP `auth` rate limit):
 * 5 failed password/2FA attempts within 15 minutes lock that login for the
 * rest of the window. Redis-backed; fails open if Redis is unavailable so an
 * outage cannot lock every admin out (the per-IP limiter still applies).
 */
export const ADMIN_LOGIN_MAX_FAILURES = 5;
export const ADMIN_LOGIN_WINDOW_SEC = 15 * 60;

export type LockoutRedis = {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
  del(...keys: string[]): Promise<unknown>;
};

export function lockoutKey(login: string): string {
  const id = createHash('sha256')
    .update(login.trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);
  return `admin:login:fail:${id}`;
}

/** Remaining lock seconds, or 0 when the login may be attempted. */
export async function lockedForSeconds(
  redis: LockoutRedis | null,
  login: string,
): Promise<number> {
  if (!redis) return 0;
  try {
    const key = lockoutKey(login);
    const count = Number((await redis.get(key)) ?? 0);
    if (count < ADMIN_LOGIN_MAX_FAILURES) return 0;
    const ttl = await redis.ttl(key);
    return ttl > 0 ? ttl : ADMIN_LOGIN_WINDOW_SEC;
  } catch {
    return 0;
  }
}

export async function recordLoginFailure(
  redis: LockoutRedis | null,
  login: string,
): Promise<number> {
  if (!redis) return 0;
  try {
    const key = lockoutKey(login);
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, ADMIN_LOGIN_WINDOW_SEC);
    return count;
  } catch {
    return 0;
  }
}

export async function clearLoginFailures(
  redis: LockoutRedis | null,
  login: string,
): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(lockoutKey(login));
  } catch {
    /* fail open */
  }
}
