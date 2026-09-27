import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../common/services/logger.service';
import {
  fetchRedisServerStats,
  getSharedRedisClient,
  isRedisCircuitOpen,
  tripRedisCircuit,
} from '../redis-connection';

const DEFAULT_TTL = 300;

@Injectable()
export class RedisCacheService {
  private unavailableLogged = false;
  private readonly memorySets = new Map<string, Set<string>>();
  /** In-process fallback for claimOnce when Redis is unavailable. */
  private readonly memoryClaims = new Map<string, number>();

  constructor(private readonly logger: LoggerService) {}

  isEnabled(): boolean {
    if (process.env.REDIS_ENABLED === 'false') return false;
    if (isRedisCircuitOpen()) return false;
    return true;
  }

  getClient() {
    if (!this.isEnabled()) throw new Error('Redis disabled');
    return getSharedRedisClient(0);
  }

  private markUnavailable(err?: unknown) {
    tripRedisCircuit();
    if (!this.unavailableLogged) {
      this.unavailableLogged = true;
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Redis unavailable — cache skipped',
      );
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isEnabled()) return null;
    try {
      const client = this.getClient();
      if (client.status !== 'ready') return null;
      const val = await client.get(key);
      return val ? (JSON.parse(val) as T) : null;
    } catch (err) {
      this.markUnavailable(err);
      return null;
    }
  }

  async set(key: string, value: unknown, ttl = DEFAULT_TTL): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      const client = this.getClient();
      if (client.status !== 'ready') return;
      await client.set(key, JSON.stringify(value), 'EX', ttl);
    } catch (err) {
      this.markUnavailable(err);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    for (const key of keys) this.memorySets.delete(key);
    if (!this.isEnabled()) return;
    try {
      await this.getClient().del(...keys);
    } catch (err) {
      this.markUnavailable(err);
    }
  }

  async sadd(key: string, member: string, ttl = DEFAULT_TTL): Promise<void> {
    const local = this.memorySets.get(key) ?? new Set<string>();
    local.add(member);
    this.memorySets.set(key, local);
    if (!this.isEnabled()) return;
    try {
      const client = this.getClient();
      if (client.status !== 'ready') return;
      await client.sadd(key, member);
      await client.expire(key, ttl);
    } catch (err) {
      this.markUnavailable(err);
    }
  }

  async srem(key: string, member: string): Promise<void> {
    this.memorySets.get(key)?.delete(member);
    if (!this.isEnabled()) return;
    try {
      const client = this.getClient();
      if (client.status !== 'ready') return;
      await client.srem(key, member);
    } catch (err) {
      this.markUnavailable(err);
    }
  }

  async scard(key: string): Promise<number> {
    if (!this.isEnabled()) {
      return this.memorySets.get(key)?.size ?? 0;
    }
    try {
      const client = this.getClient();
      if (client.status !== 'ready') {
        return this.memorySets.get(key)?.size ?? 0;
      }
      return await client.scard(key);
    } catch (err) {
      this.markUnavailable(err);
      return this.memorySets.get(key)?.size ?? 0;
    }
  }

  /**
   * Atomically claims `key` for `ttl` seconds (SET NX EX).
   * Returns true only for the first caller inside the window; later callers get false.
   * Falls back to a bounded in-process map when Redis is disabled or down.
   */
  async claimOnce(key: string, ttl = DEFAULT_TTL): Promise<boolean> {
    if (this.isEnabled()) {
      try {
        const client = this.getClient();
        if (client.status === 'ready') {
          const res = await client.set(key, '1', 'EX', ttl, 'NX');
          return res === 'OK';
        }
      } catch (err) {
        this.markUnavailable(err);
      }
    }
    return this.claimOnceInMemory(key, ttl);
  }

  private claimOnceInMemory(key: string, ttl: number): boolean {
    const now = Date.now();
    const expiresAt = this.memoryClaims.get(key);
    if (expiresAt !== undefined && expiresAt > now) return false;
    if (this.memoryClaims.size >= 50_000) {
      for (const [k, exp] of this.memoryClaims) {
        if (exp <= now) this.memoryClaims.delete(k);
      }
      if (this.memoryClaims.size >= 50_000) {
        const oldest = this.memoryClaims.keys().next().value;
        if (oldest !== undefined) this.memoryClaims.delete(oldest);
      }
    }
    this.memoryClaims.set(key, now + ttl * 1000);
    return true;
  }

  async getOrSet<T>(
    key: string,
    fn: () => Promise<T>,
    ttl = DEFAULT_TTL,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await fn();
    await this.set(key, value, ttl);
    return value;
  }

  async delPattern(pattern: string): Promise<number> {
    if (!this.isEnabled()) return 0;
    try {
      const redis = this.getClient();
      let cursor = '0';
      let deleted = 0;
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        if (keys.length) {
          await redis.del(...keys);
          deleted += keys.length;
        }
      } while (cursor !== '0');
      return deleted;
    } catch (err) {
      this.markUnavailable(err);
      return 0;
    }
  }

  async ping(): Promise<boolean> {
    if (!this.isEnabled()) return false;
    try {
      await this.getClient().ping();
      return true;
    } catch {
      return false;
    }
  }

  async serverStats() {
    if (!this.isEnabled()) return null;
    try {
      return await fetchRedisServerStats(this.getClient());
    } catch {
      return null;
    }
  }

  readonly keys = {
    user: (id: string) => `user:${id}`,
    listing: (id: string) => `listing:${id}`,
    listings: (page: number, filters: string) => `listings:${page}:${filters}`,
    post: (id: string) => `post:${id}`,
    posts: (page: number) => `posts:${page}`,
    butcher: (id: string) => `butcher:${id}`,
    butchers: (country: string, page: number) => `butchers:${country}:${page}`,
    userFeed: (userId: string, page: number) => `feed:${userId}:${page}`,
    liveStreams: () => 'streams:live',
  };
}
