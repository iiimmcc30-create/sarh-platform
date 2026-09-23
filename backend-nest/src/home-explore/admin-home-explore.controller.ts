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
import { PaidServicesService } from '../settings/paid-services.service';
import {
  AddHomeExploreDto,
  ReorderHomeExploreDto,
  UpdateHomeExploreDto,
} from './home-explore.dto';
import { HomeExploreService } from './home-explore.service';

const STAFF = ['ADMIN', 'MODERATOR'] as const;

@Controller('admin/home-explore')
export class AdminHomeExploreController {
  constructor(
    private readonly explore: HomeExploreService,
    private readonly paidServices: PaidServicesService,
  ) {}

  @Roles(...STAFF)
  @Get()
  @HttpCode(HttpStatus.OK)
  async list() {
    const sections = await this.explore.listAdmin();
    return successResponse({ sections });
  }

  @Roles(...STAFF)
  @Get('catalog')
  @HttpCode(HttpStatus.OK)
  async catalog() {
    const flags = await this.paidServices.getFlags();
    const paidOn =
      flags.promotionEnabled || flags.pinEnabled || flags.featureEnabled;
    return successResponse({ destinations: this.explore.catalog(paidOn) });
  }

  @Roles('ADMIN')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(@Body() dto: AddHomeExploreDto) {
    const sections = await this.explore.add(dto.destination);
    return successResponse({ sections });
  }

  @Roles('ADMIN')
  @Patch('reorder')
  @HttpCode(HttpStatus.OK)
  async reorder(@Body() dto: ReorderHomeExploreDto) {
    const sections = await this.explore.reorder(dto.orderedIds ?? []);
    return successResponse({ sections });
  }

  @Roles('ADMIN')
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() dto: UpdateHomeExploreDto) {
    const sections = await this.explore.update(id, dto);
    return successResponse({ sections });
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    const sections = await this.explore.remove(id);
    return successResponse({ sections });
  }
}
