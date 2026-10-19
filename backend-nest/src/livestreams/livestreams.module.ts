import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { RawBodyMiddleware } from '../common/middleware/raw-body.middleware';
import { GatewaySharedModule } from '../gateway/gateway-shared.module';
import { LivekitWebhookController } from './livekit-webhook.controller';
import { LivekitWebhookService } from './livekit-webhook.service';
import { LivestreamsController } from './livestreams.controller';
import { LivestreamsService } from './livestreams.service';
import { LivestreamsRepository } from './repositories/livestreams.repository';

@Module({
  imports: [GatewaySharedModule],
  controllers: [LivestreamsController, LivekitWebhookController],
  providers: [LivestreamsService, LivestreamsRepository, LivekitWebhookService],
})
export class LivestreamsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RawBodyMiddleware)
      .forRoutes({ path: 'livekit/webhook', method: RequestMethod.POST });
  }
}
