import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { Public, RateLimit } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import { ExploreSarhBannersService } from './explore-sarh-banners.service';

@Controller('explore-sarh-banners')
export class ExploreSarhBannersController {
  constructor(private readonly banners: ExploreSarhBannersService) {}

  @Public()
  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async list() {
    const banners = await this.banners.listPublic();
    return successResponse({ banners });
  }
}
