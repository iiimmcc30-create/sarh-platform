import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { LoggerService } from '../../common/services/logger.service';

/** Redis key written by the worker process; API health reads it. */
export const WORKER_HEARTBEAT_KEY = 'sarh:worker:heartbeat';
export const HEARTBEAT_INTERVAL_MS = 30_000;
/** Must stay > HEARTBEAT_INTERVAL_MS so a single missed tick does not flap health. */
export const HEARTBEAT_TTL_SEC = 90;

@Injectable()
export class WorkerHeartbeatService implements OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(
    private readonly cache: RedisCacheService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Explicit start — worker.main must call this after Redis is connected.
   * Nest ApplicationContext does not instantiate unused providers, so relying
   * on the constructor alone never ran the heartbeat in production.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    void this.beat();
    this.timer = setInterval(() => void this.beat(), HEARTBEAT_INTERVAL_MS);
    this.logger.info(
      { intervalMs: HEARTBEAT_INTERVAL_MS, ttlSec: HEARTBEAT_TTL_SEC },
      'Worker heartbeat started',
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
  }

  /** Exposed for tests — writes one heartbeat when Redis is ready. */
  async beat(): Promise<boolean> {
    if (!this.cache.isEnabled()) return false;
    try {
      const client = this.cache.getClient();
      if (client.status === 'wait') {
        await client.connect();
      }
      if (client.status !== 'ready') {
        this.logger.warn(
          { status: client.status },
          'Worker heartbeat skipped — Redis not ready',
        );
        return false;
      }
      await client.set(
        WORKER_HEARTBEAT_KEY,
        JSON.stringify({ ts: Date.now(), pid: process.pid }),
        'EX',
        HEARTBEAT_TTL_SEC,
      );
      return true;
    } catch (err) {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Worker heartbeat write failed',
      );
      return false;
    }
  }
}

/** Returns true when a worker heartbeat was seen within TTL window. */
export async function readWorkerHeartbeat(
  cache: RedisCacheService,
): Promise<boolean> {
  if (!cache.isEnabled()) return false;
  try {
    const client = cache.getClient();
    if (client.status !== 'ready') return false;
    const raw = await client.get(WORKER_HEARTBEAT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { ts?: number };
    return (
      typeof parsed.ts === 'number' &&
      Date.now() - parsed.ts < HEARTBEAT_TTL_SEC * 1000
    );
  } catch {
    return false;
  }
}
