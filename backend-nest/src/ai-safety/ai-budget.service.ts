import { Inject, Injectable, Optional } from '@nestjs/common';
import type IORedis from 'ioredis';
import { LoggerService } from '../common/services/logger.service';
import { getSharedRedisClient } from '../redis/redis-connection';
import {
  aiDailyRequestLimit,
  aiDailyTokenBudget,
  aiFeatureRequestLimit,
  aiFeatureTokenBudget,
} from './ai-flags';

/**
 * Shared daily AI budget (tokens + requests) in Redis, plus a separate
 * counter for the assistant and one for the summarizer. Every replica sees
 * the same counters. A feature cap cannot raise the shared ceiling.
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

export type AiBudgetFeature =
  | 'support_assistant'
  | 'knowledge_summarizer'
  | 'other';

export type AiBudgetReservation =
  | { ok: true; day: string; reserved: number; feature: AiBudgetFeature }
  | { ok: false; reason: AiBudgetDenyReason };

/** Known features get their own counters. Anything else shares `other`. */
export function aiBudgetFeature(feature: string | undefined): AiBudgetFeature {
  if (feature === 'support_assistant') return feature;
  if (feature === 'knowledge_summarizer') return feature;
  return 'other';
}

/** Minimal Redis surface used here (lets tests inject a real or fake client). */
export type AiBudgetRedis = Pick<IORedis, 'eval' | 'incrby' | 'mget'> & {
  status?: string;
  connect?: () => Promise<unknown>;
};

const DAY_TTL_SECONDS = 2 * 24 * 60 * 60;
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000; // Asia/Riyadh, no DST

const RESERVE_LUA = `
local st = tonumber(redis.call('GET', KEYS[1]) or '0')
local sr = tonumber(redis.call('GET', KEYS[2]) or '0')
local ft = tonumber(redis.call('GET', KEYS[3]) or '0')
local fr = tonumber(redis.call('GET', KEYS[4]) or '0')
local amount = tonumber(ARGV[1])
if fr + 1 > tonumber(ARGV[5]) then return {0, 2} end
if sr + 1 > tonumber(ARGV[3]) then return {0, 2} end
if ft + amount > tonumber(ARGV[4]) then return {0, 1} end
if st + amount > tonumber(ARGV[2]) then return {0, 1} end
redis.call('INCRBY', KEYS[1], amount)
redis.call('INCR', KEYS[2])
redis.call('INCRBY', KEYS[3], amount)
redis.call('INCR', KEYS[4])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[6]))
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[6]))
redis.call('EXPIRE', KEYS[3], tonumber(ARGV[6]))
redis.call('EXPIRE', KEYS[4], tonumber(ARGV[6]))
return {1, 0}
`;

export function riyadhDay(now = Date.now()): string {
  return new Date(now + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

export const AI_BUDGET_KEYS = {
  tokens: (day: string) => `ai:budget:tokens:${day}`,
  requests: (day: string) => `ai:budget:requests:${day}`,
  featureTokens: (feature: AiBudgetFeature, day: string) =>
    `ai:budget:tokens:${feature}:${day}`,
  featureRequests: (feature: AiBudgetFeature, day: string) =>
    `ai:budget:requests:${feature}:${day}`,
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

  async reserve(
    estimatedTokens: number,
    feature?: string,
  ): Promise<AiBudgetReservation> {
    const amount = Math.max(1, Math.ceil(estimatedTokens));
    const bucket = aiBudgetFeature(feature);
    const tokenBudget = aiDailyTokenBudget();
    const requestLimit = aiDailyRequestLimit();
    const featureTokens = aiFeatureTokenBudget(bucket);
    const featureRequests = aiFeatureRequestLimit(bucket);
    const day = riyadhDay();
    const keys = [
      AI_BUDGET_KEYS.tokens(day),
      AI_BUDGET_KEYS.requests(day),
      AI_BUDGET_KEYS.featureTokens(bucket, day),
      AI_BUDGET_KEYS.featureRequests(bucket, day),
    ];

    if (this.memoryOnly()) {
      const [st, sr, ft, fr] = keys.map((key) => this.memory.get(key) ?? 0);
      if (fr + 1 > featureRequests) return { ok: false, reason: 'requests' };
      if (sr + 1 > requestLimit) return { ok: false, reason: 'requests' };
      if (ft + amount > featureTokens) return { ok: false, reason: 'tokens' };
      if (st + amount > tokenBudget) return { ok: false, reason: 'tokens' };
      this.memory.set(keys[0], st + amount);
      this.memory.set(keys[1], sr + 1);
      this.memory.set(keys[2], ft + amount);
      this.memory.set(keys[3], fr + 1);
      return { ok: true, day, reserved: amount, feature: bucket };
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
        4,
        keys[0],
        keys[1],
        keys[2],
        keys[3],
        String(amount),
        String(tokenBudget),
        String(requestLimit),
        String(featureTokens),
        String(featureRequests),
        String(DAY_TTL_SECONDS),
      )) as [number, number];
      this.warnedUnavailable = false;
      if (Number(res?.[0]) === 1) {
        return { ok: true, day, reserved: amount, feature: bucket };
      }
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
    const keys = [
      AI_BUDGET_KEYS.tokens(reservation.day),
      AI_BUDGET_KEYS.featureTokens(reservation.feature, reservation.day),
    ];
    if (this.memoryOnly()) {
      for (const key of keys) {
        this.memory.set(key, Math.max(0, (this.memory.get(key) ?? 0) + delta));
      }
      return;
    }
    try {
      const client = this.redis();
      for (const key of keys) {
        await client?.incrby(key, delta);
      }
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
