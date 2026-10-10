import { Injectable, Optional } from '@nestjs/common';
import { riyadhDay } from '../../ai-safety/ai-budget.service';
import { RedisCacheService } from '../../redis/services/redis-cache.service';

export const CONVERSATION_WRITE_LIMIT = 2;
export const DAILY_WRITE_LIMIT = 3;

const TTL_SECONDS = 2 * 24 * 60 * 60;

export type WriteGate =
  | 'ok'
  | 'conversation_limit'
  | 'daily_limit'
  | 'unavailable';

/**
 * Caps agent writes: two per ticket conversation, three per user per Riyadh day.
 * Redis when it is enabled; in-memory only when Redis is turned off.
 * Redis enabled but down denies the write.
 */
@Injectable()
export class CsWriteBudget {
  private readonly memory = new Map<string, number>();

  constructor(@Optional() private readonly cache?: RedisCacheService) {}

  async reserve(userId: string, ticketId: string): Promise<WriteGate> {
    const convKey = this.convKey(ticketId);
    const dayKey = this.dayKey(userId);
    const conv = await this.bump(convKey);
    if (conv === null) return 'unavailable';
    if (conv > CONVERSATION_WRITE_LIMIT) {
      await this.drop(convKey);
      return 'conversation_limit';
    }
    const day = await this.bump(dayKey);
    if (day === null) {
      await this.drop(convKey);
      return 'unavailable';
    }
    if (day > DAILY_WRITE_LIMIT) {
      await this.drop(dayKey);
      await this.drop(convKey);
      return 'daily_limit';
    }
    return 'ok';
  }

  async release(userId: string, ticketId: string): Promise<void> {
    await this.drop(this.convKey(ticketId));
    await this.drop(this.dayKey(userId));
  }

  private convKey(ticketId: string): string {
    return `ai:cs:write:conv:${ticketId}`;
  }

  private dayKey(userId: string): string {
    return `ai:cs:write:day:${userId}:${riyadhDay()}`;
  }

  private memoryOnly(): boolean {
    return process.env.REDIS_ENABLED === 'false' || !this.cache?.isEnabled();
  }

  private async bump(key: string): Promise<number | null> {
    if (this.memoryOnly()) {
      const next = (this.memory.get(key) ?? 0) + 1;
      this.memory.set(key, next);
      return next;
    }
    try {
      const client = this.cache!.getClient();
      if (client.status !== 'ready') return null;
      const next = await client.incr(key);
      await client.expire(key, TTL_SECONDS);
      return Number(next);
    } catch {
      return null;
    }
  }

  private async drop(key: string): Promise<void> {
    if (this.memoryOnly()) {
      const next = (this.memory.get(key) ?? 0) - 1;
      if (next <= 0) this.memory.delete(key);
      else this.memory.set(key, next);
      return;
    }
    try {
      const client = this.cache!.getClient();
      if (client.status !== 'ready') return;
      await client.decr(key);
    } catch {
      // The reservation stays until the key expires.
    }
  }
}
