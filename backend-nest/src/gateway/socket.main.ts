import '../load-env';
import { NestFactory } from '@nestjs/core';
import { LoggerService } from '../common/services/logger.service';
import { initialiseSentry } from '../shared/lib/sentry';
import { validateProductionEnv } from '../config/validate-production-env';
import { GatewayModule } from './gateway.module';

function printStartupError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error('Socket server failed:', message);
  if (stack) console.error(stack);
}

async function bootstrap() {
  try {
    validateProductionEnv();
  } catch (err) {
    printStartupError(err);
    process.exit(1);
  }
  initialiseSentry();
  const app = await NestFactory.create(GatewayModule, {
    logger: ['error', 'fatal', 'warn'],
    abortOnError: false,
  });
  app.enableShutdownHooks();
  const rawPort = process.env.PORT?.trim();
  const port = rawPort && /^\d+$/.test(rawPort) ? parseInt(rawPort, 10) : 3002;
  console.log(`Socket.IO binding 0.0.0.0:${port} (PORT=${rawPort ?? ''})`);
  await app.listen(port, '0.0.0.0');

  const logger = app.get(LoggerService);
  logger.info({ port }, 'Socket.IO server running');
}

bootstrap().catch((err) => {
  printStartupError(err);
  process.exit(1);
});
