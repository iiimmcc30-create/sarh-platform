import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import { Roles } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import { UpdateButcherBannerDto } from './dto/butcher-banners.dto';
import { ButcherBannersService } from './butcher-banners.service';

const STAFF = ['ADMIN', 'MODERATOR'] as const;

@Controller('admin/butcher-banners')
export class AdminButcherBannersController {
  constructor(private readonly banners: ButcherBannersService) {}

  @Roles(...STAFF)
  @Get()
  @HttpCode(HttpStatus.OK)
  async list() {
    const banners = await this.banners.listAll();
    return successResponse({ banners });
  }

  @Roles('ADMIN')
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() dto: UpdateButcherBannerDto) {
    const banner = await this.banners.update(id, dto);
    return successResponse({ banner });
  }
}
