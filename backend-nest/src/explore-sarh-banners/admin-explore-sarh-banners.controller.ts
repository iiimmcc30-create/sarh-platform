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
} from '@nestjs/common';
import { Roles } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import {
  CreateExploreSarhBannerDto,
  ReorderExploreSarhBannersDto,
  UpdateExploreSarhBannerDto,
} from './dto/explore-sarh-banners.dto';
import { ExploreSarhBannersService } from './explore-sarh-banners.service';

const STAFF = ['ADMIN', 'MODERATOR'] as const;

@Controller('admin/explore-sarh-banners')
export class AdminExploreSarhBannersController {
  constructor(private readonly banners: ExploreSarhBannersService) {}

  @Roles(...STAFF)
  @Get()
  @HttpCode(HttpStatus.OK)
  async list() {
    const banners = await this.banners.listAll();
    return successResponse({ banners });
  }

  @Roles('ADMIN')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateExploreSarhBannerDto) {
    const banner = await this.banners.create(dto);
    return successResponse({ banner });
  }

  @Roles('ADMIN')
  @Patch('reorder')
  @HttpCode(HttpStatus.OK)
  async reorder(@Body() dto: ReorderExploreSarhBannersDto) {
    const banners = await this.banners.reorder(dto.orderedIds ?? []);
    return successResponse({ banners });
  }

  @Roles('ADMIN')
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateExploreSarhBannerDto,
  ) {
    const banner = await this.banners.update(id, dto);
    return successResponse({ banner });
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    const result = await this.banners.remove(id);
    return successResponse(result);
  }
}
