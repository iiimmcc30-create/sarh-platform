import { Controller, Headers, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public, RawBody } from '../../common/decorators/auth.decorators';
import { NiWebhookService } from '../services/ni-webhook.service';

type RequestWithRawBody = Request & { rawBody?: string };

@ApiTags('Integrations')
@Controller('integrations')
export class IntegrationsWebhookController {
  constructor(private readonly webhooks: NiWebhookService) {}

  /**
   * Network International webhook (same contract as POST /api/payments/webhook).
   * Signature: HMAC-SHA256 of raw body using NI_WEBHOOK_SECRET.
   */
  @RawBody()
  @Public()
  @Post('ni/webhook')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Network International webhook',
    description:
      'Verifies x-signature / x-ni-signature, de-duplicates events, then updates Payment + IntegrationOrder. Does not accept Sarh internal order numbers as NI UUIDs.',
  })
  async niWebhook(
    @Req() req: RequestWithRawBody,
    @Res() res: Response,
    @Headers('x-signature') xSignature?: string,
    @Headers('x-ni-signature') xNiSignature?: string,
  ) {
    const rawBody = req.rawBody ?? '';
    const signature = xSignature ?? xNiSignature;
    const verified = this.webhooks.verifySignature(rawBody, signature);
    if (!verified.ok) {
      return res.status(verified.status).json({ error: verified.error });
    }
    const result = await this.webhooks.handleRaw(rawBody);
    return res.status(result.status).json(result.body);
  }
}
