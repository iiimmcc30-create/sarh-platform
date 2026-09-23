import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { Public, RateLimit } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import { PaidServicesService } from './paid-services.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly paidServices: PaidServicesService) {}

  /**
   * Public feature flags for paid listing services.
   * Used by the mobile app to hide disabled services entirely.
   */
  @Public()
  @RateLimit('api')
  @Get('paid-services')
  @HttpCode(HttpStatus.OK)
  async paidServicesFlags() {
    const flags = await this.paidServices.getFlags();
    return successResponse({ flags });
  }
}
