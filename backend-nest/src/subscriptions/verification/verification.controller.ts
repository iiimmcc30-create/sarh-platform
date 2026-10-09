import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import { Public, RateLimit } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { successResponse } from '../../common/utils/response.util';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { VerificationStatusService } from './verification-status.service';
import { BadgeVisibilityService } from '../visibility/badge-visibility.service';
import { UpdateBadgeVisibilityDto } from '../visibility/badge-visibility.dto';

/**
 * Verification subscriptions (Blue / Blue+ / Gold).
 * Checkout goes through the existing POST /payments/initiate
 * (type = subscription, planId = blue-badge | blue-plus-badge | gold-badge, billingCycle = monthly);
 * cancel goes through the existing POST /subscriptions/cancel (refused with
 * `manage_in_store` for App Store / Google Play subscriptions).
 */
@Controller('verification')
export class VerificationController {
  constructor(
    private readonly status: VerificationStatusService,
    private readonly visibility: BadgeVisibilityService,
  ) {}

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

  /** «إخفاء الشارة» / «إخفاء بائع ذهبي» (applied to what other users see). */
  @RateLimit('api')
  @Get('preferences')
  @HttpCode(HttpStatus.OK)
  async preferences(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.visibility.getPrefs(user.userId));
  }

  @RateLimit('api')
  @Patch('preferences')
  @HttpCode(HttpStatus.OK)
  async updatePreferences(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateBadgeVisibilityDto,
  ) {
    return successResponse(await this.visibility.updatePrefs(user.userId, dto));
  }
}
