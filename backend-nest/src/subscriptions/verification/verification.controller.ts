import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { Public, RateLimit } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { successResponse } from '../../common/utils/response.util';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { VerificationStatusService } from './verification-status.service';

/**
 * Verification subscriptions (Blue / Gold badge).
 * Checkout goes through the existing POST /payments/initiate
 * (type = subscription, planId = blue-badge | gold-badge, billingCycle = monthly);
 * cancel goes through the existing POST /subscriptions/cancel.
 */
@Controller('verification')
export class VerificationController {
  constructor(private readonly status: VerificationStatusService) {}

  @Public()
  @RateLimit('api')
  @Get('plans')
  @HttpCode(HttpStatus.OK)
  async plans() {
    return successResponse({ plans: await this.status.getPlans() });
  }

  @RateLimit('api')
  @Get('status')
  @HttpCode(HttpStatus.OK)
  async mine(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.status.getForUser(user.userId));
  }
}
