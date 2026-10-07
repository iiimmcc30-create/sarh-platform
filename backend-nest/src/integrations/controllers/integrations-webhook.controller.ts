import { Controller, Headers, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public, RawBody } from '../../common/decorators/auth.decorators';
import { readNiWebhookFixedHeader } from '../utils/ni-webhook-header.util';
import { NiWebhookService } from '../services/ni-webhook.service';

type RequestWithRawBody = Request & { rawBody?: string };

@ApiTags('Integrations')
@Controller('integrations')
export class IntegrationsWebhookController {
  constructor(private readonly webhooks: NiWebhookService) {}

  /**
   * Network International webhook (same contract as POST /api/payments/webhook).
   * Auth: static header (NI_WEBHOOK_HEADER, default x-sarh-webhook-secret) equal to
   * NI_WEBHOOK_SECRET — configured in the N-Genius portal. Fallback: HMAC-SHA256 of the
   * raw body in x-signature / x-ni-signature.
   */
  @RawBody()
  @Public()
  @Post('ni/webhook')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Network International webhook',
    description:
      'Verifies the static secret header (NI_WEBHOOK_HEADER, default x-sarh-webhook-secret) or HMAC x-signature / x-ni-signature, de-duplicates events, then updates Payment + IntegrationOrder. Does not accept Sarh internal order numbers as NI UUIDs.',
  })
  async niWebhook(
    @Req() req: RequestWithRawBody,
    @Res() res: Response,
    @Headers('x-signature') xSignature?: string,
    @Headers('x-ni-signature') xNiSignature?: string,
  ) {
    const rawBody = req.rawBody ?? '';
    const signature = xSignature ?? xNiSignature;
    const verified = this.webhooks.verifySignature(
      rawBody,
      signature,
      readNiWebhookFixedHeader(req),
    );
    if (!verified.ok) {
      return res.status(verified.status).json({ error: verified.error });
    }
    const result = await this.webhooks.handleRaw(rawBody);
    return res.status(result.status).json(result.body);
  }
}
