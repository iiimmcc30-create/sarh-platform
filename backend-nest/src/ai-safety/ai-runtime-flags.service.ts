import { Injectable, Optional } from '@nestjs/common';
import { RedisCacheService } from '../redis/services/redis-cache.service';
import {
  AI_CONTROL_FLAGS,
  envAllowsFlag,
  isRuntimeFlagOff,
  setRuntimeFlagOff,
  type AiControlFlag,
} from './ai-flags';

const TTL_SECONDS = 30 * 24 * 60 * 60;

function key(name: string): string {
  return `ai:flag:${name}`;
}

export function isAiControlFlag(value: string): value is AiControlFlag {
  return (AI_CONTROL_FLAGS as readonly string[]).includes(value);
}

/**
 * Admin kill switch stored in Redis. The environment is the ceiling:
 * a stored "on" never enables a flag the environment turned off.
 */
@Injectable()
export class AiRuntimeFlagsService {
  private refreshedAt = 0;

  constructor(@Optional() private readonly cache?: RedisCacheService) {}

  async refresh(): Promise<void> {
    if (Date.now() - this.refreshedAt < 2000) return;
    this.refreshedAt = Date.now();
    if (process.env.REDIS_ENABLED === 'false' || !this.cache?.isEnabled()) {
      return;
    }
    try {
      const client = this.cache.getClient();
      if (client.status !== 'ready') return;
      const values = await client.mget(
        ...AI_CONTROL_FLAGS.map((name) => key(name)),
      );
      AI_CONTROL_FLAGS.forEach((name, index) => {
        setRuntimeFlagOff(name, values[index] === 'off');
      });
    } catch {
      // Keep the last known switch. Env off still wins.
    }
  }

  async setFlag(
    name: AiControlFlag,
    enabled: boolean,
  ): Promise<{ ok: boolean; reason?: 'env_ceiling'; effective: boolean }> {
    if (enabled && !envAllowsFlag(name)) {
      return { ok: false, reason: 'env_ceiling', effective: false };
    }
    if (!enabled) {
      setRuntimeFlagOff(name, true);
      await this.persist(name, 'off');
    } else {
      setRuntimeFlagOff(name, false);
      await this.persist(name, null);
    }
    this.refreshedAt = Date.now();
    return { ok: true, effective: this.effective(name) };
  }

  snapshot(): Array<{
    name: AiControlFlag;
    envAllows: boolean;
    runtimeOff: boolean;
    effective: boolean;
  }> {
    return AI_CONTROL_FLAGS.map((name) => ({
      name,
      envAllows: envAllowsFlag(name),
      runtimeOff: isRuntimeFlagOff(name),
      effective: this.effective(name),
    }));
  }

  private effective(name: AiControlFlag): boolean {
    if (name === 'SARH_AI_ENABLED') {
      return envAllowsFlag(name) && !isRuntimeFlagOff(name);
    }
    if (name === 'SARH_ASSISTANT_ENABLED') {
      return (
        envAllowsFlag('SARH_AI_ENABLED') &&
        !isRuntimeFlagOff('SARH_AI_ENABLED') &&
        envAllowsFlag(name) &&
        !isRuntimeFlagOff(name)
      );
    }
    if (name === 'AI_CS_AGENT_WRITE_ENABLED') {
      return (
        this.effective('SARH_AI_ENABLED') &&
        this.effective('AI_CS_AGENT_ENABLED') &&
        envAllowsFlag(name) &&
        !isRuntimeFlagOff(name)
      );
    }
    if (name === 'AI_TECH_AGENT_ENABLED' || name === 'AI_CS_AGENT_ENABLED') {
      return (
        this.effective('SARH_AI_ENABLED') &&
        envAllowsFlag(name) &&
        !isRuntimeFlagOff(name)
      );
    }
    return false;
  }

  private async persist(name: AiControlFlag, value: 'off' | null): Promise<void> {
    if (process.env.REDIS_ENABLED === 'false' || !this.cache?.isEnabled()) {
      return;
    }
    try {
      const client = this.cache.getClient();
      if (client.status !== 'ready') return;
      if (value === 'off') await client.set(key(name), 'off', 'EX', TTL_SECONDS);
      else await client.del(key(name));
    } catch {
      // The in-process switch still applies on this replica.
    }
  }
}
