import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PlansModule } from '../plans/plans.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsRepository } from './repositories/subscriptions.repository';
import { SubscriptionLifecycleRepository } from './repositories/subscription-lifecycle.repository';
import { SubscriptionCacheService } from './services/subscription-cache.service';
import { SubscriptionLifecycleService } from './services/subscription-lifecycle.service';
import { SubscriptionEntitlementService } from './services/subscription-entitlement.service';
import { SubscriptionTrialService } from './services/subscription-trial.service';
import { VerificationBadgeService } from './verification/verification-badge.service';
import { VerificationStatusService } from './verification/verification-status.service';
import { GoldDocumentGateService } from './verification/gold-document-gate.service';
import { VerificationController } from './verification/verification.controller';
import { SubscriptionBillingService } from './billing/subscription-billing.service';
import { BadgeVisibilityService } from './visibility/badge-visibility.service';
import { BadgeVisibilityInterceptor } from './visibility/badge-visibility.interceptor';

/** @deprecated Use SubscriptionEntitlementService */
export { SubscriptionEntitlementService as SubscriptionEntitlementsService } from './services/subscription-entitlement.service';

@Global()
@Module({
  imports: [PlansModule],
  controllers: [SubscriptionsController, VerificationController],
  providers: [
    SubscriptionsService,
    SubscriptionsRepository,
    SubscriptionLifecycleRepository,
    SubscriptionCacheService,
    SubscriptionLifecycleService,
    SubscriptionEntitlementService,
    SubscriptionTrialService,
    VerificationBadgeService,
    VerificationStatusService,
    GoldDocumentGateService,
    SubscriptionBillingService,
    BadgeVisibilityService,
    { provide: APP_INTERCEPTOR, useClass: BadgeVisibilityInterceptor },
  ],
  exports: [
    SubscriptionsService,
    SubscriptionCacheService,
    SubscriptionLifecycleService,
    SubscriptionEntitlementService,
    SubscriptionTrialService,
    SubscriptionLifecycleRepository,
    VerificationBadgeService,
    GoldDocumentGateService,
    SubscriptionBillingService,
    BadgeVisibilityService,
  ],
})
export class SubscriptionsModule {}
