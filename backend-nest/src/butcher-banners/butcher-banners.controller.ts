import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { Public, RateLimit } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import { ButcherBannersService } from './butcher-banners.service';

@Controller('butcher-banners')
export class ButcherBannersController {
  constructor(private readonly banners: ButcherBannersService) {}

  @Public()
  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async list() {
    const banners = await this.banners.listPublic();
    return successResponse({ banners });
  }
}
