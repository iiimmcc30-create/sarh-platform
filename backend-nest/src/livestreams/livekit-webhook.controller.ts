import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public, SkipRateLimit } from '../common/decorators/auth.decorators';
import { LivekitWebhookService } from './livekit-webhook.service';

type RequestWithRawBody = Request & { rawBody?: string };

@Controller('livekit')
export class LivekitWebhookController {
  constructor(private readonly webhooks: LivekitWebhookService) {}

  @Public()
  @SkipRateLimit()
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: RequestWithRawBody,
    @Headers('authorization') authorization?: string,
  ) {
    return this.webhooks.handle(req.rawBody ?? '', authorization);
  }
}
