import { Module } from '@nestjs/common';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { ListingsRepository } from './repositories/listings.repository';
import { ListingBoostController } from './boost/listing-boost.controller';
import { ListingBoostService } from './boost/listing-boost.service';
import { ListingPromotionController } from './promotion/listing-promotion.controller';
import { ListingPromotionService } from './promotion/listing-promotion.service';
import { PromoteQuoteService } from './promotion/promote-quote.service';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketCategoriesModule } from '../market-categories/market-categories.module';
import { SettingsModule } from '../settings/settings.module';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    PrismaModule,
    MarketCategoriesModule,
    SettingsModule,
    IntegrationsModule,
  ],
  controllers: [
    ListingsController,
    ListingBoostController,
    ListingPromotionController,
  ],
  providers: [
    ListingsService,
    ListingsRepository,
    ListingBoostService,
    ListingPromotionService,
    PromoteQuoteService,
  ],
  exports: [ListingBoostService, ListingPromotionService],
})
export class ListingsModule {}
