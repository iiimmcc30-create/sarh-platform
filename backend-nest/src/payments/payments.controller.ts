import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  forwardRef,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  Public,
  RateLimit,
  RawBody,
} from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { NiWebhookService } from '../integrations/services/ni-webhook.service';
import { InitiatePaymentDto } from './dto/payments.dto';
import { PaymentsService } from './payments.service';

type RequestWithRawBody = Request & { rawBody?: string };

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    @Inject(forwardRef(() => NiWebhookService))
    private readonly niWebhooks: NiWebhookService,
  ) {}

  @RateLimit('payment')
  @Post('initiate')
  @HttpCode(200)
  async initiate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InitiatePaymentDto,
  ) {
    return successResponse(await this.payments.initiate(user, dto));
  }

  @RateLimit('payment')
  @Post(':id/dev-complete')
  @HttpCode(200)
  async devComplete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return successResponse(await this.payments.simulateDevPayment(user, id));
  }

  /**
   * POST /api/payments/:id/sync
   * Polls Network International for the current status of a pending payment
   * and updates orders / subscriptions automatically.
   * Call this after returning from the NI checkout page if the webhook
   * hasn't fired yet (race condition, slow network, etc.).
   */
  @RateLimit('payment')
  @Post(':id/sync')
  @HttpCode(200)
  async syncStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return successResponse(await this.payments.syncPayment(user, id));
  }

  /**
   * Compatibility route for older NI webhook config.
   * Signature + processing match POST /api/integrations/ni/webhook
   * (NiWebhookService.handleRaw → IntegrationWebhookEvent idempotency).
   */
  @RawBody()
  @Public()
  @Post('webhook')
  async webhook(
    @Req() req: RequestWithRawBody,
    @Res() res: Response,
    @Headers('x-signature') xSignature?: string,
    @Headers('x-ni-signature') xNiSignature?: string,
  ) {
    const rawBody = req.rawBody ?? '';
    const signature = xSignature ?? xNiSignature;

    const verified = this.niWebhooks.verifySignature(rawBody, signature);
    if (!verified.ok) {
      return res.status(verified.status).json({ error: verified.error });
    }

    const result = await this.niWebhooks.handleRaw(rawBody);
    return res.status(result.status).json(result.body);
  }
}
