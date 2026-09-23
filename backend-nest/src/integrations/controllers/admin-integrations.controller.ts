import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IntegrationStatus } from '@prisma/client';
import { Roles } from '../../common/decorators/auth.decorators';
import { successResponse } from '../../common/utils/response.util';
import { throwApi } from '../../common/exceptions/api.exception';
import { IntegrationOrdersRepository } from '../repositories/integration-orders.repository';
import { IntegrationCheckoutService } from '../services/integration-checkout.service';

const STAFF = ['ADMIN', 'MODERATOR'] as const;

@ApiTags('Admin Integrations')
@ApiBearerAuth()
@Controller('admin/integrations')
export class AdminIntegrationsController {
  constructor(
    private readonly repo: IntegrationOrdersRepository,
    private readonly checkout: IntegrationCheckoutService,
  ) {}

  @Roles(...STAFF)
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List payment integration records (NI)' })
  async list(
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
    @Query('status') status?: string,
  ) {
    const page = Math.max(1, Number(pageRaw) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(pageSizeRaw) || 20));
    const parsedStatus =
      status &&
      Object.values(IntegrationStatus).includes(status as IntegrationStatus)
        ? (status as IntegrationStatus)
        : undefined;
    const [items, total] = await this.repo.list({
      skip: (page - 1) * pageSize,
      take: pageSize,
      status: parsedStatus,
    });
    return successResponse({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  }

  @Roles(...STAFF)
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a payment integration record' })
  async getOne(@Param('id') id: string) {
    const row = await this.repo.findById(id);
    if (!row) throwApi(404, 'not_found', 'سجل التكامل غير موجود');
    return successResponse({ integration: row });
  }

  @Roles(...STAFF)
  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Retry NI checkout for a failed integration (no duplicate if UUID already stored)',
  })
  async retry(@Param('id') id: string) {
    const row = await this.repo.findById(id);
    if (!row) throwApi(404, 'not_found', 'سجل التكامل غير موجود');
    const payment = row.payment;
    const appUrl = process.env.APP_URL ?? 'https://sarhsa.online';
    const result = await this.checkout.retryFailedCheckout(id, {
      amount: payment.amount,
      currency: payment.currency,
      description: 'سرح Payment retry',
      redirectUrl: `${appUrl}/payment/result?paymentId=${payment.id}`,
      cancelUrl: `${appUrl}/payment/cancel`,
    });
    return successResponse(result);
  }
}
