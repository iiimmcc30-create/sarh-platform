import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminMarketCategoriesController } from './admin-market-categories.controller';
import { MarketCategoriesController } from './market-categories.controller';
import { MarketCategoriesRepository } from './repositories/market-categories.repository';
import { MarketCategoriesService } from './services/market-categories.service';

@Module({
  imports: [PrismaModule],
  controllers: [MarketCategoriesController, AdminMarketCategoriesController],
  providers: [MarketCategoriesRepository, MarketCategoriesService],
  exports: [MarketCategoriesService, MarketCategoriesRepository],
})
export class MarketCategoriesModule {}
