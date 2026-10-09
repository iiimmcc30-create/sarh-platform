import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { Public, RateLimit } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';
import { throwApi } from '../common/exceptions/api.exception';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import {
  AppleNotificationDto,
  VerifyStorePurchaseDto,
} from './store-purchases.dto';
import { StorePurchasesService } from './store-purchases.service';
import { StorePurchaseError } from './store-purchases.types';

async function mapErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StorePurchaseError) {
      throwApi(err.status, err.code, err.messageAr);
    }
    throw err;
  }
}

/**
 * Apple In-App Purchase / Google Play Billing for the native apps.
 * The website and the N-Genius endpoints are unchanged.
 */
@Controller('store-purchases')
export class StorePurchasesController {
  constructor(private readonly service: StorePurchasesService) {}

  /** GET /api/store-purchases/products — product IDs + reference prices. */
  @Public()
  @Get('products')
  products() {
    return successResponse(this.service.getCatalog());
  }

  /**
   * POST /api/store-purchases/verify — the app sends the store transaction;
   * the server verifies it with Apple/Google and grants the entitlement.
   * The app finishes / acknowledges the transaction only after this succeeds.
   */
  @RateLimit('payment')
  @Post('verify')
  @HttpCode(200)
  async verify(
    @CurrentUser() user: JwtPayload,
    @Body() dto: VerifyStorePurchaseDto,
  ) {
    return successResponse(
      await mapErrors(() =>
        this.service.verifyFromClient(user.userId, {
          platform: dto.platform,
          productId: dto.productId,
          purchaseToken: dto.purchaseToken,
          transactionId: dto.transactionId,
          listingId: dto.listingId,
        }),
      ),
    );
  }

  /** App Store Server Notifications V2 (URL set in App Store Connect). */
  @Public()
  @Post('apple/notifications')
  @HttpCode(200)
  async appleNotifications(@Body() dto: AppleNotificationDto) {
    return successResponse(
      await mapErrors(() =>
        this.service.handleAppleNotification(dto.signedPayload),
      ),
    );
  }

  /** Google Play RTDN via an authenticated Pub/Sub push subscription. */
  @Public()
  @Post('google/rtdn')
  @HttpCode(200)
  async googleRtdn(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return successResponse(
      await mapErrors(() => this.service.handleGoogleRtdn(authorization, body)),
    );
  }
}
