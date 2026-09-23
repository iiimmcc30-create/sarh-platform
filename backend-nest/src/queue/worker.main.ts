import '../load-env';
import { NestFactory } from '@nestjs/core';
import { LoggerService } from '../common/services/logger.service';
import { initialiseSentry } from '../shared/lib/sentry';
import { validateProductionEnv } from '../config/validate-production-env';
import { WorkerModule } from './worker.module';
import { WorkerCronService } from './services/worker-cron.service';
import { WorkerHeartbeatService } from './services/worker-heartbeat.service';
import { FeeCheckQueueService } from './services/fee-check-queue.service';
import { RedisCacheService } from '../redis/services/redis-cache.service';

async function bootstrap() {
  try {
    validateProductionEnv();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }
  initialiseSentry();
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();

  const logger = app.get(LoggerService);
  logger.info({}, 'Worker application context started');

  // Connect Redis before starting heartbeat/cron so the first beat can write.
  try {
    const cache = app.get(RedisCacheService);
    const client = cache.getClient();
    if (client.status === 'wait') {
      await client.connect();
    }
    const stats = await cache.serverStats();
    if (stats) {
      logger.info(stats, 'Redis server clients');
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'Redis INFO clients unavailable',
    );
  }

  // ApplicationContext does not instantiate unused providers — retrieve them.
  app.get(WorkerCronService);
  app.get(WorkerHeartbeatService).start();

  try {
    const fees = app.get(FeeCheckQueueService);
    const job = await fees.addProbeJob();
    logger.info({ jobId: job?.id ?? null }, 'BullMQ probe job enqueued');
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'BullMQ probe enqueue failed',
    );
  }
}

bootstrap().catch((err) => {
  console.error('Worker bootstrap failed', err);
  process.exit(1);
});
