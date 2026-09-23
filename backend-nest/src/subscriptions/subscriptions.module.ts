import { Global, Module } from '@nestjs/common';
import { PlansModule } from '../plans/plans.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsRepository } from './repositories/subscriptions.repository';
import { SubscriptionLifecycleRepository } from './repositories/subscription-lifecycle.repository';
import { SubscriptionCacheService } from './services/subscription-cache.service';
import { SubscriptionLifecycleService } from './services/subscription-lifecycle.service';
import { SubscriptionEntitlementService } from './services/subscription-entitlement.service';

/** @deprecated Use SubscriptionEntitlementService */
export { SubscriptionEntitlementService as SubscriptionEntitlementsService } from './services/subscription-entitlement.service';

@Global()
@Module({
  imports: [PlansModule],
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionsService,
    SubscriptionsRepository,
    SubscriptionLifecycleRepository,
    SubscriptionCacheService,
    SubscriptionLifecycleService,
    SubscriptionEntitlementService,
  ],
  exports: [
    SubscriptionsService,
    SubscriptionCacheService,
    SubscriptionLifecycleService,
    SubscriptionEntitlementService,
    SubscriptionLifecycleRepository,
  ],
})
export class SubscriptionsModule {}
