import { Module } from '@nestjs/common';
import { PaymentsRepository } from '../payments/repositories/payments.repository';
import { StoreEntitlementsService } from './store-entitlements.service';
import { StorePurchaseVerifierService } from './store-purchase-verifier.service';
import { StorePurchasesController } from './store-purchases.controller';
import { StorePurchasesRepository } from './store-purchases.repository';
import { StorePurchasesService } from './store-purchases.service';

/**
 * Apple IAP / Google Play Billing (native digital services).
 * PaymentsRepository is provided here (stateless Prisma repository) so the
 * fulfilment logic is reused without changing PaymentsModule.
 */
@Module({
  controllers: [StorePurchasesController],
  providers: [
    PaymentsRepository,
    StorePurchasesRepository,
    StorePurchaseVerifierService,
    StoreEntitlementsService,
    StorePurchasesService,
  ],
  exports: [StorePurchasesService, StorePurchasesRepository],
})
export class StorePurchasesModule {}
