import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
  forwardRef,
} from '@nestjs/common';
import { RawBodyMiddleware } from '../common/middleware/raw-body.middleware';
import { PaymentsModule } from '../payments/payments.module';
import { PAYMENT_GATEWAY } from './interfaces/payment-gateway.interface';
import { IntegrationOrdersRepository } from './repositories/integration-orders.repository';
import { IntegrationCheckoutService } from './services/integration-checkout.service';
import { IntegrationEnvService } from './services/integration-env.service';
import { NiWebhookService } from './services/ni-webhook.service';
import { NiGatewayAdapter } from './providers/ni/ni-gateway.adapter';
import { IntegrationsWebhookController } from './controllers/integrations-webhook.controller';
import { AdminIntegrationsController } from './controllers/admin-integrations.controller';

@Module({
  imports: [forwardRef(() => PaymentsModule)],
  controllers: [IntegrationsWebhookController, AdminIntegrationsController],
  providers: [
    IntegrationEnvService,
    IntegrationOrdersRepository,
    NiGatewayAdapter,
    {
      provide: PAYMENT_GATEWAY,
      useExisting: NiGatewayAdapter,
    },
    IntegrationCheckoutService,
    NiWebhookService,
  ],
  exports: [
    IntegrationCheckoutService,
    IntegrationOrdersRepository,
    NiWebhookService,
  ],
})
export class IntegrationsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RawBodyMiddleware).forRoutes({
      path: 'integrations/ni/webhook',
      method: RequestMethod.POST,
    });
  }
}
