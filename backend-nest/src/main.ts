import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: resolve(process.cwd(), '../backend/.env') });
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  json,
  urlencoded,
  static as expressStatic,
  Request,
  Response,
  NextFunction,
} from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { logger } from './shared/lib/logger';
import { initialiseSentry } from './shared/lib/sentry';
import { isAllowedCorsOrigin } from './lib/cors-origins';
import { validateProductionEnv } from './config/validate-production-env';

async function bootstrap() {
  try {
    validateProductionEnv();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }
  initialiseSentry();
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const url = req.url ?? '';
    if (url.startsWith('/api/v1/')) {
      req.url = url.replace('/api/v1/', '/api/');
    }
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      req.path === '/api/payments/webhook' ||
      req.path === '/api/integrations/ni/webhook' ||
      req.path === '/api/upload/direct'
    )
      return next();
    return json({ limit: '64kb' })(req, res, next);
  });

  app.use(urlencoded({ extended: true, limit: '64kb' }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const isPublicUpload =
      req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS'
        ? (req.path || '').startsWith('/uploads')
        : false;
    const origin = isPublicUpload
      ? req.headers.origin || '*'
      : req.headers.origin && isAllowedCorsOrigin(req.headers.origin)
        ? req.headers.origin
        : null;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      if (!isPublicUpload) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
    }
    if (isPublicUpload) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization,Content-Type,X-Requested-With,X-Request-ID,x-cron-secret,x-signature,x-ni-signature',
    );
    res.setHeader('Vary', 'Origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (
      process.env.NODE_ENV === 'production' &&
      (req.headers['x-forwarded-proto'] === 'https' || req.secure === true)
    ) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  app.use(
    '/uploads',
    expressStatic(join(process.cwd(), 'public', 'uploads'), {
      maxAge: '7d',
      fallthrough: true,
    }),
  );

  // Payment return URLs from Network International hit the API host (APP_URL)
  // without the /api prefix — bridge pages open the mobile deep link.
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'payment/result', method: RequestMethod.GET },
      { path: 'payment/cancel', method: RequestMethod.GET },
      { path: 'privacy', method: RequestMethod.GET },
      { path: 'join', method: RequestMethod.GET },
      { path: 'join/success', method: RequestMethod.GET },
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const swaggerEnabled =
    process.env.NODE_ENV !== 'production' ||
    process.env.SWAGGER_ENABLED === 'true';

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('سرح API')
      .setDescription(
        'NestJS migration — backward compatible with React Native client',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = parseInt(process.env.PORT || '3001', 10);
  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');
  logger.info({ port }, 'سرح NestJS API running');
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Failed to start NestJS API');
  process.exit(1);
});
