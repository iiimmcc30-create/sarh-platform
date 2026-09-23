import { Injectable } from '@nestjs/common';
import { RedisCacheService } from '../../redis/services/redis-cache.service';

@Injectable()
export class SubscriptionCacheService {
  constructor(private readonly cache: RedisCacheService) {}

  cacheKey(userId: string): string {
    return `subscription:${userId}`;
  }

  async invalidate(userId: string): Promise<void> {
    await this.cache.del(this.cacheKey(userId));
  }

  reminderKey(userId: string, kind: string): string {
    return `subscription:reminder:${userId}:${kind}`;
  }

  async markReminderSent(
    userId: string,
    kind: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (!this.cache.isEnabled()) return true;
    try {
      const redis = this.cache.getClient();
      const key = this.reminderKey(userId, kind);
      const acquired = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
      return acquired === 'OK';
    } catch {
      return true;
    }
  }
}
