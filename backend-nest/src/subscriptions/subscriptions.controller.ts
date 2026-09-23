import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { RateLimit } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionLifecycleService } from './services/subscription-lifecycle.service';
import { SubscriptionCacheService } from './services/subscription-cache.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly subscriptionCache: SubscriptionCacheService,
  ) {}

  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async getMine(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.subscriptions.getMine(user));
  }

  @RateLimit('api')
  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@CurrentUser() user: JwtPayload) {
    const result = await this.lifecycle.cancelAutoRenew(user.userId);
    await this.subscriptionCache.invalidate(user.userId);
    return successResponse(result);
  }
}
