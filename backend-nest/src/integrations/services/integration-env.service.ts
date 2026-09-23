import { Injectable, OnModuleInit } from '@nestjs/common';
import { isNiOrderUuid, isNiSandboxMockMode } from '../../payments/ni-client';
import { LoggerService } from '../../common/services/logger.service';

@Injectable()
export class IntegrationEnvService implements OnModuleInit {
  constructor(private readonly logger: LoggerService) {}

  onModuleInit() {
    this.validate();
  }

  validate(): void {
    const baseUrl = process.env.NI_BASE_URL?.trim();
    const apiKey = process.env.NI_API_KEY?.trim();
    const outletId = process.env.NI_OUTLET_ID?.trim();
    const webhookSecret = process.env.NI_WEBHOOK_SECRET?.trim();
    const mock = isNiSandboxMockMode();
    const production = process.env.NODE_ENV === 'production';

    if (outletId && !isNiOrderUuid(outletId)) {
      throw new Error(
        'NI_OUTLET_ID must be a UUID (Network International outlet reference)',
      );
    }

    if (production && mock) {
      throw new Error(
        'Network International mock/sandbox credentials are not allowed in production. Set a real NI_API_KEY.',
      );
    }

    if (production) {
      const missing: string[] = [];
      if (!baseUrl) missing.push('NI_BASE_URL');
      if (!apiKey) missing.push('NI_API_KEY');
      if (!outletId) missing.push('NI_OUTLET_ID');
      if (!webhookSecret) missing.push('NI_WEBHOOK_SECRET');
      if (missing.length) {
        throw new Error(
          `Network International env missing in production: ${missing.join(', ')}`,
        );
      }
    }

    this.logger.info(
      {
        niBaseUrl: baseUrl || 'unset',
        niOutletConfigured: Boolean(outletId),
        mockMode: mock,
      },
      'NI integration environment checked',
    );
  }
}
