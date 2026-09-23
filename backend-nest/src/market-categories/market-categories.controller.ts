import { Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { Public, RateLimit } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import { MarketCategoriesService } from './services/market-categories.service';

@Controller('categories')
export class MarketCategoriesController {
  constructor(private readonly categories: MarketCategoriesService) {}

  @Public()
  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async list() {
    return successResponse({
      categories: await this.categories.listPublicTree(),
    });
  }

  @Public()
  @RateLimit('api')
  @Get(':id/subcategories')
  @HttpCode(HttpStatus.OK)
  async subcategories(@Param('id') id: string) {
    return successResponse({
      subcategories: await this.categories.listSubcategories(id),
    });
  }

  @Public()
  @RateLimit('api')
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getById(@Param('id') id: string) {
    return successResponse({
      category: await this.categories.getById(id),
    });
  }
}
