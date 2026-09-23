import { Injectable } from '@nestjs/common';
import {
  getSharedRedisClient,
  isRedisCircuitOpen,
  tripRedisCircuit,
} from '../redis-connection';

@Injectable()
export class RedisSessionService {
  isEnabled(): boolean {
    if (process.env.REDIS_ENABLED === 'false') return false;
    if (isRedisCircuitOpen()) return false;
    return true;
  }

  getClient() {
    if (!this.isEnabled()) throw new Error('Redis disabled');
    return getSharedRedisClient(2);
  }

  async set(key: string, value: unknown, ttl: number): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      await this.getClient().set(key, JSON.stringify(value), 'EX', ttl);
    } catch {
      tripRedisCircuit();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isEnabled()) return null;
    try {
      const client = this.getClient();
      if (client.status !== 'ready') return null;
      const val = await client.get(key);
      return val ? (JSON.parse(val) as T) : null;
    } catch {
      tripRedisCircuit();
      return null;
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!keys.length || !this.isEnabled()) return;
    try {
      await this.getClient().del(...keys);
    } catch {
      /* non-critical */
    }
  }

  async ping(): Promise<boolean> {
    if (!this.isEnabled()) return false;
    try {
      await this.getClient().ping();
      return true;
    } catch {
      tripRedisCircuit();
      return false;
    }
  }
}
