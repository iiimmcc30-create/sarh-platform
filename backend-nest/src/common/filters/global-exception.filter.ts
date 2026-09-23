import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiException } from '../exceptions/api.exception';
import { RateLimitException } from '../exceptions/rate-limit.exception';
import { isButcherApplicationError } from '../../butcher-applications/errors';
import { Sentry } from '../../shared/lib/sentry';

function sendJson(
  res: Response,
  status: number,
  body: Record<string, unknown>,
) {
  if (res.headersSent) return;
  res.status(status).json(body);
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (res.headersSent) return;

    if (exception instanceof ApiException) {
      sendJson(
        res,
        exception.status,
        exception.toJSON() as Record<string, unknown>,
      );
      return;
    }

    if (isButcherApplicationError(exception)) {
      sendJson(res, exception.httpStatus, {
        success: false,
        error: exception.code,
        messageAr: exception.messageAr,
        ...(exception.details !== undefined
          ? { details: exception.details }
          : {}),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (exception instanceof RateLimitException) {
      res.setHeader('Retry-After', String(exception.retryAfter));
      sendJson(res, 429, {
        ...exception.toJSON(),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (status >= 500) {
        Sentry.captureException(exception);
      }

      if (typeof payload === 'object' && payload !== null) {
        if ('success' in payload) {
          sendJson(res, status, {
            ...(payload as Record<string, unknown>),
            timestamp: new Date().toISOString(),
          });
          return;
        }
        const body = payload as { message?: string | string[]; error?: string };
        const messageAr = Array.isArray(body.message)
          ? body.message.join('، ')
          : typeof body.message === 'string'
            ? body.message
            : 'طلب غير صالح';

        sendJson(res, status, {
          success: false,
          error:
            body.error ?? (status === 400 ? 'validation_error' : 'http_error'),
          messageAr,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (status === 405) {
        if (!res.headersSent) res.status(405).end();
        return;
      }

      const messageAr = typeof payload === 'string' ? payload : 'طلب غير صالح';
      sendJson(res, status, {
        success: false,
        error: status === 400 ? 'validation_error' : 'http_error',
        messageAr,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    Sentry.captureException(exception);
    sendJson(res, 500, {
      success: false,
      error: 'server_error',
      messageAr: 'خطأ في الخادم',
      timestamp: new Date().toISOString(),
    });
  }
}
