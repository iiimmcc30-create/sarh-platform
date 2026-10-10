import { Injectable, Optional } from '@nestjs/common';
import { RedisCacheService } from '../../redis/services/redis-cache.service';

export type TechDraft = {
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  service: string;
  cause: string;
  fix: string;
  createdAt: string;
};

const KEY = 'ai:tech:drafts';
const MAX = 20;

@Injectable()
export class TechDraftStore {
  private memory: TechDraft[] = [];

  constructor(@Optional() private readonly cache?: RedisCacheService) {}

  async save(draft: TechDraft): Promise<void> {
    this.memory = [draft, ...this.memory].slice(0, MAX);
    if (process.env.REDIS_ENABLED === 'false' || !this.cache?.isEnabled()) {
      return;
    }
    try {
      const client = this.cache.getClient();
      if (client.status !== 'ready') return;
      await client.set(KEY, JSON.stringify(this.memory), 'EX', 7 * 24 * 60 * 60);
    } catch {
      // The in-process draft remains for this replica.
    }
  }

  async list(): Promise<TechDraft[]> {
    if (process.env.REDIS_ENABLED === 'false' || !this.cache?.isEnabled()) {
      return this.memory;
    }
    try {
      const client = this.cache.getClient();
      if (client.status !== 'ready') return this.memory;
      const raw = await client.get(KEY);
      if (!raw) return this.memory;
      const parsed = JSON.parse(raw) as TechDraft[];
      if (!Array.isArray(parsed)) return this.memory;
      this.memory = parsed.slice(0, MAX);
      return this.memory;
    } catch {
      return this.memory;
    }
  }
}
