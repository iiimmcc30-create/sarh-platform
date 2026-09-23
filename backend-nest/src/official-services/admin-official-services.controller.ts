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
  CreateOfficialServiceDto,
  UpdateOfficialServiceDto,
} from './dto/official-services.dto';
import { OfficialServicesService } from './official-services.service';

const STAFF = ['ADMIN', 'MODERATOR'] as const;

@Controller('admin/services')
export class AdminOfficialServicesController {
  constructor(private readonly services: OfficialServicesService) {}

  @Roles(...STAFF)
  @Get()
  @HttpCode(HttpStatus.OK)
  async list() {
    const services = await this.services.listAll();
    return successResponse({ services });
  }

  @Roles('ADMIN')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateOfficialServiceDto) {
    const service = await this.services.create(dto);
    return successResponse({ service });
  }

  @Roles('ADMIN')
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() dto: UpdateOfficialServiceDto) {
    const service = await this.services.update(id, dto);
    return successResponse({ service });
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    return successResponse(await this.services.remove(id));
  }
}
