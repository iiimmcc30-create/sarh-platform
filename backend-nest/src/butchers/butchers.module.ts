import { Module, forwardRef } from '@nestjs/common';
import { ButchersController } from './butchers.controller';
import { ButchersService } from './butchers.service';
import { ButchersRepository } from './repositories/butchers.repository';
import { OrderLifecycleService } from './services/order-lifecycle.service';
import { OrderStateMachineService } from './services/order-state-machine.service';
import { ButcherRankingService } from './services/butcher-ranking.service';
import { UnpaidOrderExpiryService } from './services/unpaid-order-expiry.service';
import { GatewaySharedModule } from '../gateway/gateway-shared.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    GatewaySharedModule,
    SubscriptionsModule,
    forwardRef(() => PaymentsModule),
  ],
  controllers: [ButchersController],
  providers: [
    ButchersService,
    ButchersRepository,
    OrderLifecycleService,
    OrderStateMachineService,
    ButcherRankingService,
    UnpaidOrderExpiryService,
  ],
  exports: [ButcherRankingService, OrderLifecycleService],
})
export class ButchersModule {}
