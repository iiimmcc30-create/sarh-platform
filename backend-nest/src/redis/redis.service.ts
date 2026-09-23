import { Injectable } from '@nestjs/common';
import { RedisCacheService } from './services/redis-cache.service';
import { RedisSessionService } from './services/redis-session.service';

@Injectable()
export class RedisService {
  readonly CacheKeys;

  constructor(
    private readonly cache: RedisCacheService,
    private readonly session: RedisSessionService,
  ) {
    this.CacheKeys = cache.keys;
  }

  isEnabled = () => this.cache.isEnabled();

  getRedis = () => this.cache.getClient();

  getSessionRedis = () => this.session.getClient();

  cacheGet = <T>(key: string) => this.cache.get<T>(key);

  cacheSet = (key: string, value: unknown, ttl?: number) =>
    this.cache.set(key, value, ttl);

  cacheDel = (...keys: string[]) => this.cache.del(...keys);

  cacheGetOrSet = <T>(key: string, fn: () => Promise<T>, ttl?: number) =>
    this.cache.getOrSet(key, fn, ttl);

  cacheDelPattern = (pattern: string) => this.cache.delPattern(pattern);

  sessionGet = <T>(key: string) => this.session.get<T>(key);

  sessionSet = (key: string, value: unknown, ttl: number) =>
    this.session.set(key, value, ttl);

  sessionDel = (...keys: string[]) => this.session.del(...keys);
}
