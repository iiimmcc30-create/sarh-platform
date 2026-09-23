import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import {
  RATE_LIMIT_KEY,
  SKIP_RATE_LIMIT_KEY,
} from '../decorators/auth.decorators';
import {
  RateLimitService,
  RateLimitType,
} from '../services/rate-limit.service';
import { RateLimitException } from '../exceptions/rate-limit.exception';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rateLimit: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    const type =
      this.reflector.getAllAndOverride<RateLimitType>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'api';

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const allowed = await this.rateLimit.consume(req, res, type);
    if (!allowed) {
      const retryAfter = res.getHeader('Retry-After');
      const sec =
        typeof retryAfter === 'string'
          ? parseInt(retryAfter, 10)
          : typeof retryAfter === 'number'
            ? retryAfter
            : 900;
      throw new RateLimitException(sec);
    }
    return true;
  }
}
