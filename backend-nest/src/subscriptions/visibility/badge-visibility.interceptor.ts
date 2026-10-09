import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { maskHiddenBadges } from './badge-visibility';
import { BadgeVisibilityService } from './badge-visibility.service';

/**
 * Masks hidden badges / «بائع ذهبي» labels in every JSON response (see
 * badge-visibility.ts). Admin endpoints are left untouched. When nobody hides
 * anything (the common case) the payload passes through as is.
 */
@Injectable()
export class BadgeVisibilityInterceptor implements NestInterceptor {
  constructor(private readonly visibility: BadgeVisibilityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { userId?: string } }>();
    const path = req.originalUrl ?? req.url ?? '';
    if (/\/admin(\/|$|\?)/.test(path)) return next.handle();
    return next
      .handle()
      .pipe(
        mergeMap((body) =>
          from(
            this.visibility
              .hiddenMap()
              .then((hidden) =>
                maskHiddenBadges(body, hidden, req.user?.userId),
              ),
          ),
        ),
      );
  }
}
