import { Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import * as jwt from 'jsonwebtoken';
import { LoggerService } from './logger.service';
import { getSharedRedisClient } from '../../redis/redis-connection';

export type RateLimitType = 'api' | 'auth' | 'payment';

const TRUSTED_PROXIES = new Set(
  (process.env.TRUSTED_PROXIES || '127.0.0.1,::1,172.0.0.0/8,10.0.0.0/8')
    .split(',')
    .map((s) => s.trim()),
);

@Injectable()
export class RateLimitService {
  private limiterInstance: RateLimiterRedis | RateLimiterMemory | null = null;
  private authLimiterInstance: RateLimiterRedis | RateLimiterMemory | null =
    null;
  private paymentLimiterInstance: RateLimiterRedis | RateLimiterMemory | null =
    null;
  private memoryLimiters: Record<string, RateLimiterMemory> = {};

  constructor(private readonly logger: LoggerService) {}

  isRedisEnabled(): boolean {
    return process.env.REDIS_ENABLED !== 'false';
  }

  private getRedisClient() {
    return getSharedRedisClient(0);
  }

  getClientIp(req: Request): string {
    const directIp = req.socket.remoteAddress || 'unknown';
    const isTrustedProxy =
      TRUSTED_PROXIES.has(directIp) ||
      directIp.startsWith('172.') ||
      directIp.startsWith('10.') ||
      directIp === '::ffff:127.0.0.1';

    if (!isTrustedProxy) {
      return directIp;
    }

    // Prefer X-Real-IP: nginx sets this to $remote_addr (the socket peer of nginx).
    // This resists client-spoofed X-Forwarded-For prefixes on the Hostinger path.
    const realIpHeader = req.headers['x-real-ip'];
    const realIp = Array.isArray(realIpHeader) ? realIpHeader[0] : realIpHeader;
    if (typeof realIp === 'string' && realIp.trim()) {
      return realIp.trim();
    }

    // Fallback: rightmost XFF hop (appended by the immediate reverse proxy).
    const forwarded = req.headers['x-forwarded-for'];
    const forwardedRaw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (typeof forwardedRaw === 'string' && forwardedRaw.trim()) {
      const ips = forwardedRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (ips.length > 0) {
        return ips[ips.length - 1];
      }
    }

    return directIp;
  }

  private getMemoryLimiter(
    points: number,
    duration: number,
    keyPrefix: string,
  ) {
    const key = `${keyPrefix}:${points}:${duration}`;
    if (!this.memoryLimiters[key]) {
      this.memoryLimiters[key] = new RateLimiterMemory({
        keyPrefix,
        points,
        duration,
      });
    }
    return this.memoryLimiters[key];
  }

  private getLimiter(
    points: number,
    duration: number,
    keyPrefix: string,
    blockDuration = 60,
  ) {
    if (!this.isRedisEnabled()) {
      return new RateLimiterMemory({ keyPrefix, points, duration });
    }
    try {
      return new RateLimiterRedis({
        storeClient: this.getRedisClient(),
        keyPrefix,
        points,
        duration,
        blockDuration,
      });
    } catch {
      this.logger.warn(
        { keyPrefix },
        'Redis unavailable at setup, falling back to memory rate limiter',
      );
      return new RateLimiterMemory({ keyPrefix, points, duration });
    }
  }

  private getApiLimiter() {
    if (!this.limiterInstance) {
      this.limiterInstance = this.getLimiter(
        this.apiMax(),
        this.apiWindowSec(),
        'rl:api',
      );
    }
    return this.limiterInstance;
  }

  private userLimiterInstance: RateLimiterRedis | RateLimiterMemory | null =
    null;

  /**
   * Signed-in app traffic is limited per account, not per IP: mobile carriers
   * put many users behind one IP (CGNAT), and fast normal navigation fires
   * dozens of reads per screen. Abuse protection stays (per-account budget +
   * the per-IP bucket for anonymous traffic, auth and payments unchanged).
   */
  private getUserLimiter() {
    if (!this.userLimiterInstance) {
      this.userLimiterInstance = this.getLimiter(
        this.userMax(),
        this.userWindowSec(),
        'rl:user',
        30,
      );
    }
    return this.userLimiterInstance;
  }

  private userMax() {
    const n = parseInt(process.env.RATE_LIMIT_USER_MAX || '900', 10);
    return Number.isFinite(n) && n > 0 ? n : 900;
  }

  private userWindowSec() {
    const n = parseInt(process.env.RATE_LIMIT_USER_WINDOW_SEC || '60', 10);
    return Number.isFinite(n) && n > 0 ? n : 60;
  }

  /** Verified access-token subject, or null (anonymous / invalid / expired). */
  verifiedUserId(req: Request): string | null {
    const header = req.headers?.authorization;
    const raw = Array.isArray(header) ? header[0] : header;
    if (typeof raw !== 'string' || !raw.startsWith('Bearer ')) return null;
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    try {
      const payload = jwt.verify(raw.slice(7), secret) as { userId?: unknown };
      return typeof payload.userId === 'string' && payload.userId
        ? payload.userId
        : null;
    } catch {
      return null;
    }
  }

  private getAuthLimiter() {
    if (!this.authLimiterInstance) {
      this.authLimiterInstance = this.getLimiter(
        this.authMax(),
        this.authWindowSec(),
        'rl:auth',
        60,
      );
    }
    return this.authLimiterInstance;
  }

  private apiMax() {
    const n = parseInt(process.env.RATE_LIMIT_MAX || '200', 10);
    return Number.isFinite(n) && n > 0 ? n : 200;
  }

  private apiWindowSec() {
    const ms = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
    const sec = (Number.isFinite(ms) && ms > 0 ? ms : 900000) / 1000;
    return sec;
  }

  private authMax() {
    const n = parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10);
    return Number.isFinite(n) && n > 0 ? n : 20;
  }

  private authWindowSec() {
    const n = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_SEC || '900', 10);
    return Number.isFinite(n) && n > 0 ? n : 900;
  }

  private getPaymentLimiter() {
    if (!this.paymentLimiterInstance) {
      this.paymentLimiterInstance = this.getLimiter(
        10,
        3600,
        'rl:payment',
        3600,
      );
    }
    return this.paymentLimiterInstance;
  }

  private shouldFailClosedOnRedisError(
    req: Request,
    type: RateLimitType,
  ): boolean {
    if (!this.isRedisEnabled()) return false;
    if (type === 'auth' || type === 'payment') return true;
    return (req.originalUrl || req.url || '').startsWith('/api/admin');
  }

  async consume(
    req: Request,
    res: Response,
    type: RateLimitType = 'api',
  ): Promise<boolean> {
    if (process.env.NODE_ENV === 'development') {
      return true;
    }

    const ip = this.getClientIp(req);
    const userId = type === 'api' ? this.verifiedUserId(req) : null;
    if (userId) {
      return this.consumeUser(req, res, userId);
    }
    const limits = {
      api: this.apiMax(),
      auth: this.authMax(),
      payment: 10,
    };
    const windows = {
      api: this.apiWindowSec(),
      auth: this.authWindowSec(),
      payment: 3600,
    };

    const isRedisReady =
      this.isRedisEnabled() && this.getRedisClient().status === 'ready';

    try {
      let result;
      if (isRedisReady) {
        const limiterMap = {
          api: () => this.getApiLimiter(),
          auth: () => this.getAuthLimiter(),
          payment: () => this.getPaymentLimiter(),
        };
        result = await limiterMap[type]().consume(ip);
      } else {
        const memoryLimiter = this.getMemoryLimiter(
          limits[type],
          windows[type],
          `rl:mem:${type}`,
        );
        result = await memoryLimiter.consume(ip);
      }

      res.setHeader('X-RateLimit-Limit', limits[type]);
      res.setHeader('X-RateLimit-Remaining', result.remainingPoints);
      res.setHeader(
        'X-RateLimit-Reset',
        new Date(Date.now() + result.msBeforeNext).toISOString(),
      );
      return true;
    } catch (rejRes: unknown) {
      if (rejRes instanceof Error) {
        this.logger.error(
          { err: rejRes.message, ip, type },
          'Rate limiter Redis error, failing open',
        );
        if (this.shouldFailClosedOnRedisError(req, type)) {
          res.setHeader('Retry-After', 5);
          return false;
        }
        return true;
      }

      const rateRes = rejRes as { msBeforeNext: number };
      const retryAfterSec = Math.round(rateRes.msBeforeNext / 1000);
      this.logger.warn({ ip, type }, 'Rate limit exceeded');
      res.setHeader('Retry-After', retryAfterSec);
      // Response body is sent once by GlobalExceptionFilter (RateLimitGuard throws).
      return false;
    }
  }

  private async consumeUser(
    req: Request,
    res: Response,
    userId: string,
  ): Promise<boolean> {
    const isRedisReady =
      this.isRedisEnabled() && this.getRedisClient().status === 'ready';
    try {
      const limiter = isRedisReady
        ? this.getUserLimiter()
        : this.getMemoryLimiter(
            this.userMax(),
            this.userWindowSec(),
            'rl:mem:user',
          );
      const result = await limiter.consume(`u:${userId}`);
      res.setHeader('X-RateLimit-Limit', this.userMax());
      res.setHeader('X-RateLimit-Remaining', result.remainingPoints);
      return true;
    } catch (rejRes: unknown) {
      if (rejRes instanceof Error) {
        this.logger.error(
          { err: rejRes.message, userId },
          'User rate limiter error, failing open',
        );
        return !this.shouldFailClosedOnRedisError(req, 'api');
      }
      const rateRes = rejRes as { msBeforeNext: number };
      this.logger.warn({ userId }, 'User rate limit exceeded');
      res.setHeader(
        'Retry-After',
        Math.max(1, Math.round(rateRes.msBeforeNext / 1000)),
      );
      return false;
    }
  }
}
