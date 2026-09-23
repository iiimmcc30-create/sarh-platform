import { Controller, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import {
  OptionalAuth,
  Public,
  RateLimit,
} from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { successResponse } from '../common/utils/response.util';
import { OfficialServicesService } from './official-services.service';

@Controller('services')
export class OfficialServicesController {
  constructor(private readonly services: OfficialServicesService) {}

  @Public()
  @OptionalAuth()
  @RateLimit('api')
  @Get('account')
  @HttpCode(HttpStatus.OK)
  async account(@CurrentUser() viewer?: JwtPayload) {
    const account = await this.services.getAccount(viewer?.userId);
    return successResponse({ account });
  }

  @Public()
  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async list() {
    const services = await this.services.listActive();
    return successResponse({ services });
  }

  @Public()
  @RateLimit('api')
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getById(@Param('id') id: string) {
    const service = await this.services.getActiveById(id);
    return successResponse({ service });
  }
}
