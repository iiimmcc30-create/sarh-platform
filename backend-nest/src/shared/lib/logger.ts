// src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  base: { service: 'sarouh-api', env: process.env.NODE_ENV },
  serializers: {
    err: pino.stdSerializers.err,
    req: (req) => ({ method: req.method, url: req.url }),
  },
});

// Request logger middleware for Next.js
export function logRequest(
  method: string,
  url: string,
  statusCode: number,
  durationMs: number,
  userId?: string,
) {
  logger.info({ method, url, statusCode, durationMs, userId }, 'HTTP request');
}
