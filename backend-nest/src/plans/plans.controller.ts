import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { PlanAudience } from '@prisma/client';
import { Public } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import { PlansService } from './plans.service';

@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async getPlans(@Query('audience') audience?: PlanAudience) {
    return successResponse(await this.plans.getPlans(audience));
  }
}
