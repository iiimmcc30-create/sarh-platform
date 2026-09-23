import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public, RateLimit } from '../../common/decorators/auth.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { successResponse } from '../../common/utils/response.util';
import { throwApi } from '../../common/exceptions/api.exception';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { DaftraService } from './daftra.service';
import { z } from 'zod';

const pageQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().max(100).optional(),
  })
  .strict();

const linkSchema = z
  .object({
    daftraProductId: z.coerce.number().int().positive(),
    sarhProductId: z.string().uuid().optional().nullable(),
  })
  .strict();

const productIdSchema = z.coerce.number().int().positive();

const oauthStartQuerySchema = z
  .object({
    accountIdentifier: z.string().min(2).max(80).optional(),
  })
  .strict();

@Controller('butchers/daftra')
export class ButcherDaftraController {
  constructor(private readonly daftra: DaftraService) {}

  @RateLimit('api')
  @Get('status')
  @HttpCode(HttpStatus.OK)
  async status(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.daftra.statusForOwner(user));
  }

  @RateLimit('api')
  @Post('test-connection')
  @HttpCode(HttpStatus.OK)
  async testConnection(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.daftra.testConnectionForOwner(user));
  }

  @RateLimit('api')
  @Get('oauth/start')
  @HttpCode(HttpStatus.OK)
  async oauthStart(
    @CurrentUser() user: JwtPayload,
    @Query() query: Record<string, unknown>,
  ) {
    const parsed = oauthStartQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    return successResponse(
      await this.daftra.startOAuthForOwner(user, parsed.data.accountIdentifier),
    );
  }

  /**
   * Browser redirect target for Daftra OAuth. Must stay Public.
   * Production URI: https://sarhsa.online/api/butchers/daftra/oauth/callback
   */
  @Public()
  @RateLimit('api')
  @Get('oauth/callback')
  async oauthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const { redirectUrl } = await this.daftra.handleOAuthCallback({
      code,
      state,
      error,
    });
    return res.redirect(HttpStatus.FOUND, redirectUrl);
  }

  @RateLimit('api')
  @Get('oauth/status')
  @HttpCode(HttpStatus.OK)
  async oauthStatus(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.daftra.oauthStatusForOwner(user));
  }

  @RateLimit('api')
  @Post('oauth/disconnect')
  @HttpCode(HttpStatus.OK)
  async oauthDisconnect(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.daftra.disconnectOAuthForOwner(user));
  }

  @RateLimit('api')
  @Get('products')
  @HttpCode(HttpStatus.OK)
  async products(
    @CurrentUser() user: JwtPayload,
    @Query() query: Record<string, unknown>,
  ) {
    const parsed = pageQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    const butcherId = await this.daftra.requireOwnedButcherId(user);
    return successResponse(
      await this.daftra.listProducts(butcherId, parsed.data),
    );
  }

  @RateLimit('api')
  @Get('products/:id')
  @HttpCode(HttpStatus.OK)
  async product(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const productId = productIdSchema.safeParse(id);
    if (!productId.success) throwApi(400, 'invalid_id', 'معرّف غير صالح');
    const butcherId = await this.daftra.requireOwnedButcherId(user);
    return successResponse(
      await this.daftra.getProduct(butcherId, productId.data),
    );
  }

  @RateLimit('api')
  @Get('inventory')
  @HttpCode(HttpStatus.OK)
  async inventory(
    @CurrentUser() user: JwtPayload,
    @Query() query: Record<string, unknown>,
  ) {
    const parsed = pageQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    const butcherId = await this.daftra.requireOwnedButcherId(user);
    return successResponse(
      await this.daftra.listInventory(butcherId, parsed.data),
    );
  }

  @RateLimit('api')
  @Get('inventory/:id')
  @HttpCode(HttpStatus.OK)
  async inventoryItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const productId = productIdSchema.safeParse(id);
    if (!productId.success) throwApi(400, 'invalid_id', 'معرّف غير صالح');
    const butcherId = await this.daftra.requireOwnedButcherId(user);
    return successResponse(
      await this.daftra.getProductStock(butcherId, productId.data),
    );
  }

  @RateLimit('api')
  @Get('product-links')
  @HttpCode(HttpStatus.OK)
  async links(@CurrentUser() user: JwtPayload) {
    const butcherId = await this.daftra.requireOwnedButcherId(user);
    return successResponse({
      links: await this.daftra.listProductLinks(butcherId),
    });
  }

  @RateLimit('api')
  @Post('product-links')
  @HttpCode(HttpStatus.CREATED)
  async link(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    const parsed = linkSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'بيانات غير صحيحة',
        parsed.error.flatten(),
      );
    }
    const butcherId = await this.daftra.requireOwnedButcherId(user);
    return successResponse(
      await this.daftra.linkProduct(butcherId, parsed.data),
    );
  }
}
