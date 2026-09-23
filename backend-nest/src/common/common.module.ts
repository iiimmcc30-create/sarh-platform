import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { RequestIdInterceptor } from './interceptors/request-id.interceptor';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RateLimitService } from './services/rate-limit.service';
import { LoggerService } from './services/logger.service';

@Global()
@Module({
  providers: [
    LoggerService,
    RateLimitService,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [RateLimitService, LoggerService],
})
export class CommonModule {}
