import type { RedisCacheService } from '../../redis/services/redis-cache.service';
import {
  COUNCIL_CODE_COUNCIL_MAX_FAILS,
  COUNCIL_CODE_USER_MAX_FAILS,
  COUNCIL_CODE_WINDOW_SEC,
} from './council-policy';

export type CodeLock =
  { locked: false } | { locked: true; retryAfterSec: number };

/**
 * Throttles WRONG join-code attempts for private councils: per user+council and per
 * council (multi-account guessing). Redis INCR when available, else a per-process map.
 * A locked user is rejected before the code is even compared, so a lockout reveals
 * nothing about the code.
 */
export class CouncilCodeLimiter {
  private readonly memory = new Map<string, { n: number; until: number }>();

  constructor(
    private readonly cache: Pick<RedisCacheService, 'isEnabled' | 'getClient'>,
    private readonly now: () => number = Date.now,
  ) {}

  private keys(councilId: string, userId: string) {
    return {
      user: `council:codefail:u:${councilId}:${userId}`,
      council: `council:codefail:c:${councilId}`,
    };
  }

  private redis() {
    if (!this.cache.isEnabled()) return null;
    try {
      const c = this.cache.getClient();
      return c.status === 'ready' ? c : null;
    } catch {
      return null;
    }
  }

  private async count(key: string): Promise<{ n: number; ttl: number }> {
    const r = this.redis();
    if (r) {
      try {
        const [n, ttl] = await Promise.all([r.get(key), r.ttl(key)]);
        return { n: Number(n ?? 0), ttl: Math.max(ttl, 0) };
      } catch {
        // fall through to memory
      }
    }
    const e = this.memory.get(key);
    if (!e || e.until <= this.now()) return { n: 0, ttl: 0 };
    return { n: e.n, ttl: Math.ceil((e.until - this.now()) / 1000) };
  }

  private async bump(key: string): Promise<void> {
    const r = this.redis();
    if (r) {
      try {
        const n = await r.incr(key);
        if (n === 1) await r.expire(key, COUNCIL_CODE_WINDOW_SEC);
        return;
      } catch {
        // fall through to memory
      }
    }
    const e = this.memory.get(key);
    if (!e || e.until <= this.now()) {
      this.memory.set(key, {
        n: 1,
        until: this.now() + COUNCIL_CODE_WINDOW_SEC * 1000,
      });
    } else {
      e.n += 1;
    }
  }

  /** Counts one event under `key`; false (+ retry delay) once `max` is exceeded in the window. */
  async throttle(
    key: string,
    max: number,
    windowSec: number,
  ): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
    const r = this.redis();
    if (r) {
      try {
        const n = await r.incr(key);
        if (n === 1) await r.expire(key, windowSec);
        if (n <= max) return { ok: true };
        const ttl = await r.ttl(key);
        return { ok: false, retryAfterSec: ttl > 0 ? ttl : windowSec };
      } catch {
        // fall through to memory
      }
    }
    const e = this.memory.get(key);
    if (!e || e.until <= this.now()) {
      this.memory.set(key, { n: 1, until: this.now() + windowSec * 1000 });
      return { ok: true };
    }
    e.n += 1;
    if (e.n <= max) return { ok: true };
    return {
      ok: false,
      retryAfterSec: Math.ceil((e.until - this.now()) / 1000),
    };
  }

  async check(councilId: string, userId: string): Promise<CodeLock> {
    const k = this.keys(councilId, userId);
    const [u, c] = await Promise.all([
      this.count(k.user),
      this.count(k.council),
    ]);
    if (u.n >= COUNCIL_CODE_USER_MAX_FAILS) {
      return { locked: true, retryAfterSec: u.ttl || COUNCIL_CODE_WINDOW_SEC };
    }
    if (c.n >= COUNCIL_CODE_COUNCIL_MAX_FAILS) {
      return { locked: true, retryAfterSec: c.ttl || COUNCIL_CODE_WINDOW_SEC };
    }
    return { locked: false };
  }

  async recordFailure(councilId: string, userId: string): Promise<void> {
    const k = this.keys(councilId, userId);
    await Promise.all([this.bump(k.user), this.bump(k.council)]);
  }

  async reset(councilId: string, userId: string): Promise<void> {
    const k = this.keys(councilId, userId);
    this.memory.delete(k.user);
    const r = this.redis();
    if (r) await r.del(k.user).catch(() => 0);
  }
}
