import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { Public, RateLimit } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import { HomeExploreService } from './home-explore.service';

@Controller('home')
export class HomeExploreController {
  constructor(private readonly explore: HomeExploreService) {}

  @Public()
  @RateLimit('api')
  @Get('explore')
  @HttpCode(HttpStatus.OK)
  async list() {
    const sections = await this.explore.listPublic();
    return successResponse({ sections });
  }
}
