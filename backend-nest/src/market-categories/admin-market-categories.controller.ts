import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { Roles } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import {
  CreateMarketCategoryDto,
  ReorderMarketCategoriesDto,
  UpdateMarketCategoryDto,
} from './dto/market-categories.dto';
import { MarketCategoriesService } from './services/market-categories.service';

const STAFF = ['ADMIN', 'MODERATOR'] as const;

@Controller('admin/categories')
export class AdminMarketCategoriesController {
  constructor(private readonly categories: MarketCategoriesService) {}

  @Roles(...STAFF)
  @Get()
  @HttpCode(HttpStatus.OK)
  async list() {
    return successResponse({
      categories: await this.categories.listAdminTree(),
    });
  }

  @Roles(...STAFF)
  @Put('reorder')
  @HttpCode(HttpStatus.OK)
  async reorder(@Body() dto: ReorderMarketCategoriesDto) {
    return successResponse(await this.categories.reorder(dto));
  }

  @Roles(...STAFF)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateMarketCategoryDto) {
    return successResponse({
      category: await this.categories.create(dto),
    });
  }

  @Roles(...STAFF)
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() dto: UpdateMarketCategoryDto) {
    return successResponse({
      category: await this.categories.update(id, dto),
    });
  }

  @Roles(...STAFF)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    return successResponse(await this.categories.remove(id));
  }
}
