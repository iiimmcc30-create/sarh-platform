import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { logger } from '../shared/lib/logger';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    (this as any).$on('error', (e: { message: string }) => {
      logger.error({ message: e.message }, 'Prisma error');
    });

    if (process.env.NODE_ENV !== 'production') {
      (this as any).$on('query', (e: { query: string; duration: number }) => {
        if (process.env.LOG_QUERIES === 'true') {
          logger.debug({ query: e.query, duration: e.duration }, 'DB query');
        }
      });
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
