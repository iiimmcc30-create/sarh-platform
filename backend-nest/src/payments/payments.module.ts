import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
  forwardRef,
} from '@nestjs/common';
import { RawBodyMiddleware } from '../common/middleware/raw-body.middleware';
import { PaymentRedirectController } from './payment-redirect.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsRepository } from './repositories/payments.repository';
import { SettingsModule } from '../settings/settings.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { GatewaySharedModule } from '../gateway/gateway-shared.module';

@Module({
  imports: [
    SettingsModule,
    GatewaySharedModule,
    forwardRef(() => IntegrationsModule),
  ],
  controllers: [PaymentsController, PaymentRedirectController],
  providers: [PaymentsService, PaymentsRepository],
  exports: [PaymentsService],
})
export class PaymentsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RawBodyMiddleware)
      .forRoutes({ path: 'payments/webhook', method: RequestMethod.POST });
  }
}
