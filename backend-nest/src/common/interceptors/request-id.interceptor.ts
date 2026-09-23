import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const forwarded = req.headers['x-request-id'];
    let id: string;
    if (
      typeof forwarded === 'string' &&
      /^[a-zA-Z0-9_-]{8,64}$/.test(forwarded)
    ) {
      id = forwarded;
    } else {
      id = randomUUID();
    }

    (req as Request & { requestId?: string }).requestId = id;
    res.setHeader('X-Request-ID', id);

    return next.handle().pipe(tap());
  }
}
