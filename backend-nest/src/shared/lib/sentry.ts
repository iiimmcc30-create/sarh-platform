// Nest migration — Sentry via @sentry/node (same behavior as Next.js integration)
import * as Sentry from '@sentry/node';
import { logger } from './logger';

let initialised = false;

export function initialiseSentry(): void {
  if (initialised) return;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('SENTRY_DSN not set — error tracking disabled in production');
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version || '1.0.0',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    ignoreErrors: [
      'TokenExpiredError',
      'JsonWebTokenError',
      /^ECONNRESET$/,
      /^EPIPE$/,
    ],
    beforeSend(event, hint) {
      if (event.request?.data) {
        const body = event.request.data as Record<string, unknown>;
        [
          'password',
          'currentPassword',
          'newPassword',
          'refreshToken',
          'accessToken',
          'fcmToken',
        ].forEach((key) => {
          if (key in body) body[key] = '[REDACTED]';
        });
      }
      return event;
    },
  });

  initialised = true;
  logger.info({ dsn: dsn.slice(0, 30) + '...' }, 'Sentry initialised');
}

export function withSentry<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context?: Record<string, unknown>,
): T {
  return (async (...args: unknown[]) => {
    try {
      return await fn(...args);
    } catch (err) {
      Sentry.withScope((scope) => {
        if (context) scope.setExtras(context);
        Sentry.captureException(err);
      });
      throw err;
    }
  }) as T;
}

export { Sentry };
