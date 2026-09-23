import { Injectable } from '@nestjs/common';
import pino from 'pino';

@Injectable()
export class LoggerService {
  private readonly logger = pino({
    level:
      process.env.LOG_LEVEL ||
      (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    base: { service: 'sarouh-api', env: process.env.NODE_ENV },
  });

  info(obj: object, msg?: string) {
    this.logger.info(obj, msg);
  }

  warn(obj: object, msg?: string) {
    this.logger.warn(obj, msg);
  }

  error(obj: object, msg?: string) {
    this.logger.error(obj, msg);
  }

  debug(obj: object, msg?: string) {
    this.logger.debug(obj, msg);
  }

  fatal(obj: object, msg?: string) {
    this.logger.fatal(obj, msg);
  }
}
