import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { RateLimit, Roles } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { successResponse } from '../../common/utils/response.util';
import { throwApi } from '../../common/exceptions/api.exception';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { DaftraService } from './daftra.service';
import { z } from 'zod';

const butcherIdSchema = z.string().uuid();

const configureSchema = z
  .object({
    accountIdentifier: z.string().min(2).max(80),
    apiKey: z.string().min(16).max(512).optional(),
    daftraLoginEmail: z.string().email().max(254).optional().nullable(),
    daftraLoginUrl: z.string().url().max(500).optional().nullable(),
  })
  .strict();

const pageQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().max(100).optional(),
  })
  .strict();

const productIdSchema = z.coerce.number().int().positive();

const testSchema = z
  .object({
    sendInvite: z.boolean().optional(),
    invitePassword: z.string().min(4).max(128).optional(),
  })
  .strict();

@Controller('admin/butchers')
export class AdminDaftraController {
  constructor(private readonly daftra: DaftraService) {}

  @Roles('ADMIN')
  @RateLimit('api')
  @Get(':id/daftra')
  @HttpCode(HttpStatus.OK)
  async getStatus(@Param('id') id: string) {
    const butcherId = butcherIdSchema.safeParse(id);
    if (!butcherId.success) throwApi(400, 'invalid_id', 'معرّف غير صالح');
    return successResponse(await this.daftra.getStatus(butcherId.data));
  }

  @Roles('ADMIN')
  @RateLimit('api')
  @Put(':id/daftra')
  @HttpCode(HttpStatus.OK)
  async configure(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const butcherId = butcherIdSchema.safeParse(id);
    if (!butcherId.success) throwApi(400, 'invalid_id', 'معرّف غير صالح');
    const parsed = configureSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    return successResponse(
      await this.daftra.configure(user.userId, butcherId.data, parsed.data),
    );
  }

  @Roles('ADMIN')
  @RateLimit('api')
  @Post(':id/daftra/test')
  @HttpCode(HttpStatus.OK)
  async testConnection(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const butcherId = butcherIdSchema.safeParse(id);
    if (!butcherId.success) throwApi(400, 'invalid_id', 'معرّف غير صالح');
    const parsed = testSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    return successResponse(
      await this.daftra.testConnection(
        user.userId,
        butcherId.data,
        parsed.data,
      ),
    );
  }

  @Roles('ADMIN')
  @RateLimit('api')
  @Post(':id/daftra/disable')
  @HttpCode(HttpStatus.OK)
  async disable(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const butcherId = butcherIdSchema.safeParse(id);
    if (!butcherId.success) throwApi(400, 'invalid_id', 'معرّف غير صالح');
    return successResponse(
      await this.daftra.disable(user.userId, butcherId.data),
    );
  }

  @Roles('ADMIN')
  @RateLimit('api')
  @Get(':id/daftra/products')
  @HttpCode(HttpStatus.OK)
  async products(
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    const butcherId = butcherIdSchema.safeParse(id);
    if (!butcherId.success) throwApi(400, 'invalid_id', 'معرّف غير صالح');
    const parsed = pageQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    return successResponse(
      await this.daftra.listProducts(butcherId.data, parsed.data),
    );
  }

  @Roles('ADMIN')
  @RateLimit('api')
  @Post(':id/daftra/products/sync')
  @HttpCode(HttpStatus.OK)
  async syncProducts(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const butcherId = butcherIdSchema.safeParse(id);
    if (!butcherId.success) throwApi(400, 'invalid_id', 'معرّف غير صالح');
    return successResponse(
      await this.daftra.syncProductsFromDaftra(user.userId, butcherId.data),
    );
  }

  @Roles('ADMIN')
  @RateLimit('api')
  @Get(':id/daftra/products/:productId')
  @HttpCode(HttpStatus.OK)
  async product(
    @Param('id') id: string,
    @Param('productId') productIdParam: string,
  ) {
    const butcherId = butcherIdSchema.safeParse(id);
    const productId = productIdSchema.safeParse(productIdParam);
    if (!butcherId.success || !productId.success) {
      throwApi(400, 'invalid_id', 'معرّف غير صالح');
    }
    return successResponse(
      await this.daftra.getProduct(butcherId.data, productId.data),
    );
  }

  @Roles('ADMIN')
  @RateLimit('api')
  @Get(':id/daftra/inventory')
  @HttpCode(HttpStatus.OK)
  async inventory(
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    const butcherId = butcherIdSchema.safeParse(id);
    if (!butcherId.success) throwApi(400, 'invalid_id', 'معرّف غير صالح');
    const parsed = pageQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    return successResponse(
      await this.daftra.listInventory(butcherId.data, parsed.data),
    );
  }
}
