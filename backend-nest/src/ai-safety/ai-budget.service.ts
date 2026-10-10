import { Inject, Injectable, Optional } from '@nestjs/common';
import type IORedis from 'ioredis';
import { LoggerService } from '../common/services/logger.service';
import { getSharedRedisClient } from '../redis/redis-connection';
import { aiDailyRequestLimit, aiDailyTokenBudget } from './ai-flags';

/**
 * Shared daily AI budget (tokens + requests) in Redis, so every API / worker
 * replica sees the same counters.
 *
 * Reservation model: before a call we atomically (one Lua script) check
 * `used + estimate <= budget` and `requests + 1 <= limit`, then INCRBY the
 * estimate (input estimate + max output). After the call we settle with the
 * real usage (delta may be negative). Concurrent callers therefore cannot
 * jointly overshoot the budget by more than the estimation error of calls
 * already in flight.
 *
 * Redis down (but enabled) → fail closed: no model call, the caller falls back
 * to the rule-based answer. With REDIS_ENABLED=false (single-process dev)
 * an in-process counter is used instead.
 */

export type AiBudgetDenyReason = 'tokens' | 'requests' | 'unavailable';

export type AiBudgetReservation =
  | { ok: true; day: string; reserved: number }
  | { ok: false; reason: AiBudgetDenyReason };

/** Minimal Redis surface used here (lets tests inject a real or fake client). */
export type AiBudgetRedis = Pick<IORedis, 'eval' | 'incrby' | 'mget'> & {
  status?: string;
  connect?: () => Promise<unknown>;
};

const DAY_TTL_SECONDS = 2 * 24 * 60 * 60;
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000; // Asia/Riyadh, no DST

const RESERVE_LUA = `
local t = tonumber(redis.call('GET', KEYS[1]) or '0')
local r = tonumber(redis.call('GET', KEYS[2]) or '0')
local amount = tonumber(ARGV[1])
if r + 1 > tonumber(ARGV[3]) then return {0, 2} end
if t + amount > tonumber(ARGV[2]) then return {0, 1} end
redis.call('INCRBY', KEYS[1], amount)
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[4]))
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[4]))
return {1, 0}
`;

export function riyadhDay(now = Date.now()): string {
  return new Date(now + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

export const AI_BUDGET_KEYS = {
  tokens: (day: string) => `ai:budget:tokens:${day}`,
  requests: (day: string) => `ai:budget:requests:${day}`,
};

export const AI_BUDGET_REDIS = Symbol('AI_BUDGET_REDIS');

@Injectable()
export class AiBudgetService {
  private readonly memory = new Map<string, number>();
  private warnedUnavailable = false;

  constructor(
    private readonly logger: LoggerService,
    @Optional()
    @Inject(AI_BUDGET_REDIS)
    private readonly redisOverride?: AiBudgetRedis,
  ) {}

  private redis(): AiBudgetRedis | null {
    if (this.redisOverride) return this.redisOverride;
    if (process.env.REDIS_ENABLED === 'false') return null;
    const client = getSharedRedisClient(0);
    return client as unknown as AiBudgetRedis;
  }

  private memoryOnly(): boolean {
    return !this.redisOverride && process.env.REDIS_ENABLED === 'false';
  }

  async reserve(estimatedTokens: number): Promise<AiBudgetReservation> {
    const amount = Math.max(1, Math.ceil(estimatedTokens));
    const tokenBudget = aiDailyTokenBudget();
    const requestLimit = aiDailyRequestLimit();
    const day = riyadhDay();

    if (this.memoryOnly()) {
      const tKey = AI_BUDGET_KEYS.tokens(day);
      const rKey = AI_BUDGET_KEYS.requests(day);
      const t = this.memory.get(tKey) ?? 0;
      const r = this.memory.get(rKey) ?? 0;
      if (r + 1 > requestLimit) return { ok: false, reason: 'requests' };
      if (t + amount > tokenBudget) return { ok: false, reason: 'tokens' };
      this.memory.set(tKey, t + amount);
      this.memory.set(rKey, r + 1);
      return { ok: true, day, reserved: amount };
    }

    const client = this.redis();
    if (client?.status === 'wait' && client.connect) {
      await client.connect().catch(() => undefined);
    }
    if (!client || (client.status && client.status !== 'ready')) {
      this.warnUnavailable();
      return { ok: false, reason: 'unavailable' };
    }
    try {
      const res = (await client.eval(
        RESERVE_LUA,
        2,
        AI_BUDGET_KEYS.tokens(day),
        AI_BUDGET_KEYS.requests(day),
        String(amount),
        String(tokenBudget),
        String(requestLimit),
        String(DAY_TTL_SECONDS),
      )) as [number, number];
      this.warnedUnavailable = false;
      if (Number(res?.[0]) === 1) return { ok: true, day, reserved: amount };
      return {
        ok: false,
        reason: Number(res?.[1]) === 2 ? 'requests' : 'tokens',
      };
    } catch (err) {
      this.warnUnavailable(err);
      return { ok: false, reason: 'unavailable' };
    }
  }

  /**
   * Replace the reservation with the real usage. `actualTokens` null means
   * unknown (e.g. timeout: the provider may still bill) → keep the reservation.
   * `refund` gives the reserved tokens back (request was rejected before use).
   */
  async settle(
    reservation: AiBudgetReservation,
    actualTokens: number | null,
    opts: { refund?: boolean } = {},
  ): Promise<void> {
    if (!reservation.ok) return;
    let delta = 0;
    if (opts.refund) delta = -reservation.reserved;
    else if (actualTokens !== null && Number.isFinite(actualTokens)) {
      delta = Math.ceil(actualTokens) - reservation.reserved;
    }
    if (delta === 0) return;
    const key = AI_BUDGET_KEYS.tokens(reservation.day);
    if (this.memoryOnly()) {
      this.memory.set(key, Math.max(0, (this.memory.get(key) ?? 0) + delta));
      return;
    }
    try {
      await this.redis()?.incrby(key, delta);
    } catch (err) {
      this.warnUnavailable(err);
    }
  }

  /** Today's counters (numbers only) for diagnostics. */
  async usageToday(): Promise<{
    day: string;
    tokens: number;
    requests: number;
  }> {
    const day = riyadhDay();
    if (this.memoryOnly()) {
      return {
        day,
        tokens: this.memory.get(AI_BUDGET_KEYS.tokens(day)) ?? 0,
        requests: this.memory.get(AI_BUDGET_KEYS.requests(day)) ?? 0,
      };
    }
    try {
      const [t, r] = (await this.redis()?.mget(
        AI_BUDGET_KEYS.tokens(day),
        AI_BUDGET_KEYS.requests(day),
      )) ?? [null, null];
      return { day, tokens: Number(t ?? 0), requests: Number(r ?? 0) };
    } catch {
      return { day, tokens: 0, requests: 0 };
    }
  }

  private warnUnavailable(err?: unknown) {
    if (this.warnedUnavailable) return;
    this.warnedUnavailable = true;
    this.logger.warn(
      { err: err instanceof Error ? err.name : undefined },
      'AI budget store (Redis) unavailable — AI calls paused, rule-based fallback in use',
    );
  }
}
