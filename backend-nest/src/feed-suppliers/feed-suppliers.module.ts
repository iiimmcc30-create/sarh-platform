import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  AdminFeedProductsController,
  AdminFeedSuppliersController,
} from './admin-feed-suppliers.controller';
import { FeedSuppliersController } from './feed-suppliers.controller';
import { FeedSuppliersService } from './feed-suppliers.service';
import { FeedSuppliersRepository } from './repositories/feed-suppliers.repository';

@Module({
  imports: [PrismaModule],
  controllers: [
    FeedSuppliersController,
    AdminFeedSuppliersController,
    AdminFeedProductsController,
  ],
  providers: [FeedSuppliersService, FeedSuppliersRepository],
  exports: [FeedSuppliersService],
})
export class FeedSuppliersModule {}
