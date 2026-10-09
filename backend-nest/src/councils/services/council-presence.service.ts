import { Injectable } from '@nestjs/common';
import { RedisCacheService } from '../../redis/services/redis-cache.service';

/** A member is "present" while their socket heartbeats (every ~25s) keep arriving. */
export const COUNCIL_PRESENCE_STALE_MS = 75_000;
const KEY_TTL_SEC = 6 * 60 * 60;

export function councilPresenceKey(councilId: string): string {
  return `council:presence:${councilId}`;
}

/**
 * «المجالس» presence: one Redis sorted set per council (member = userId, score = last
 * heartbeat ms). Self-healing — a crashed socket server simply stops refreshing scores.
 * Listener counts come from here; listeners are never loaded as rows. Falls back to an
 * in-process map when Redis is unavailable (single-instance dev).
 */
@Injectable()
export class CouncilPresenceService {
  private readonly memory = new Map<string, Map<string, number>>();

  constructor(private readonly cache: RedisCacheService) {}

  private client() {
    if (!this.cache.isEnabled()) return null;
    try {
      const client = this.cache.getClient();
      return client.status === 'ready' ? client : null;
    } catch {
      return null;
    }
  }

  /** True when presence is backed by Redis (shared by API + socket processes). */
  isShared(): boolean {
    return this.client() !== null;
  }

  async touch(councilId: string, userId: string, now = Date.now()) {
    const local = this.memory.get(councilId) ?? new Map<string, number>();
    local.set(userId, now);
    this.memory.set(councilId, local);
    const client = this.client();
    if (!client) return;
    const key = councilPresenceKey(councilId);
    try {
      await client.zadd(key, now, userId);
      await client.expire(key, KEY_TTL_SEC);
    } catch {
      /* best effort */
    }
  }

  async remove(councilId: string, userId: string) {
    this.memory.get(councilId)?.delete(userId);
    const client = this.client();
    if (!client) return;
    try {
      await client.zrem(councilPresenceKey(councilId), userId);
    } catch {
      /* best effort */
    }
  }

  async clear(councilId: string) {
    this.memory.delete(councilId);
    const client = this.client();
    if (!client) return;
    try {
      await client.del(councilPresenceKey(councilId));
    } catch {
      /* best effort */
    }
  }

  /** Number of users currently present in the council. */
  async count(councilId: string, now = Date.now()): Promise<number> {
    const cutoff = now - COUNCIL_PRESENCE_STALE_MS;
    const client = this.client();
    if (client) {
      const key = councilPresenceKey(councilId);
      try {
        await client.zremrangebyscore(key, '-inf', `(${cutoff}`);
        return await client.zcard(key);
      } catch {
        /* fall through */
      }
    }
    const local = this.memory.get(councilId);
    if (!local) return 0;
    let n = 0;
    for (const [userId, at] of local) {
      if (at >= cutoff) n++;
      else local.delete(userId);
    }
    return n;
  }

  /**
   * Every user currently present (most recent heartbeat first). Used for the
   * participants grid; the caller pages the result, never the whole room per client.
   */
  async presentIds(councilId: string, now = Date.now()): Promise<string[]> {
    const cutoff = now - COUNCIL_PRESENCE_STALE_MS;
    const client = this.client();
    if (client) {
      try {
        return await client.zrevrangebyscore(
          councilPresenceKey(councilId),
          '+inf',
          cutoff,
        );
      } catch {
        /* fall through */
      }
    }
    const local = this.memory.get(councilId);
    if (!local) return [];
    return [...local.entries()]
      .filter(([, at]) => at >= cutoff)
      .sort((a, b) => b[1] - a[1])
      .map(([userId]) => userId);
  }

  /** Subset of `userIds` currently present. */
  async presentAmong(
    councilId: string,
    userIds: string[],
    now = Date.now(),
  ): Promise<Set<string>> {
    const out = new Set<string>();
    if (userIds.length === 0) return out;
    const cutoff = now - COUNCIL_PRESENCE_STALE_MS;
    const client = this.client();
    if (client) {
      try {
        const scores = await client.zmscore(
          councilPresenceKey(councilId),
          ...userIds,
        );
        scores.forEach((score, i) => {
          if (score !== null && Number(score) >= cutoff) out.add(userIds[i]);
        });
        return out;
      } catch {
        /* fall through */
      }
    }
    const local = this.memory.get(councilId);
    for (const id of userIds) {
      const at = local?.get(id);
      if (at !== undefined && at >= cutoff) out.add(id);
    }
    return out;
  }
}
