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
  Query,
} from '@nestjs/common';
import { PlanAudience } from '@prisma/client';
import { Roles } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import { throwApi } from '../common/exceptions/api.exception';
import { PlansService } from './plans.service';
import {
  CreatePlanDto,
  UpdatePlanDto,
  UpdatePlanFeaturesDto,
} from './dto/plans.dto';
import { PLAN_FEATURE_CATALOG } from './plan-feature-catalog';

const STAFF = ['ADMIN', 'MODERATOR'] as const;

@Controller('admin/plans')
export class AdminPlansController {
  constructor(private readonly plans: PlansService) {}

  @Roles(...STAFF)
  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@Query('audience') audience?: PlanAudience) {
    const all = await this.plans.getPlansForAdmin();
    const items = audience
      ? all.filter((p: { audience: PlanAudience }) => p.audience === audience)
      : all;
    return successResponse({ plans: items });
  }

  @Roles(...STAFF)
  @Get('feature-catalog/list')
  @HttpCode(HttpStatus.OK)
  async featureCatalog(@Query('audience') audience?: PlanAudience) {
    const features = audience
      ? PLAN_FEATURE_CATALOG.filter((item) => item.audiences.includes(audience))
      : PLAN_FEATURE_CATALOG;
    return successResponse({ features });
  }

  @Roles(...STAFF)
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getOne(@Param('id') id: string) {
    const plan = await this.plans.getPlanById(id);
    if (!plan) throwApi(404, 'not_found', 'الباقة غير موجودة');
    return successResponse({ plan });
  }

  @Roles('ADMIN')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreatePlanDto) {
    const plan = await this.plans.createPlan(body);
    return successResponse({ plan });
  }

  @Roles('ADMIN')
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() body: UpdatePlanDto) {
    const plan = await this.plans.updatePlan(id, body);
    return successResponse({ plan });
  }

  @Roles('ADMIN')
  @Patch(':id/features')
  @HttpCode(HttpStatus.OK)
  async updateFeatures(
    @Param('id') id: string,
    @Body() body: UpdatePlanFeaturesDto,
  ) {
    const plan = await this.plans.updatePlan(id, { features: body.features });
    return successResponse({ plan });
  }

  @Roles('ADMIN')
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id') id: string) {
    const plan = await this.plans.deactivatePlan(id);
    return successResponse({ plan });
  }

  @Roles('ADMIN')
  @Post(':id/duplicate')
  @HttpCode(HttpStatus.OK)
  async duplicate(@Param('id') id: string) {
    const plan = await this.plans.duplicatePlan(id);
    if (!plan) throwApi(404, 'not_found', 'الباقة غير موجودة');
    return successResponse({ plan });
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    try {
      return successResponse(await this.plans.deletePlanIfUnused(id));
    } catch {
      throwApi(400, 'plan_in_use', 'لا يمكن حذف باقة مستخدمة');
    }
  }
}
