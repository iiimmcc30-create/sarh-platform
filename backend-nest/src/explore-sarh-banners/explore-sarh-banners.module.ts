import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminExploreSarhBannersController } from './admin-explore-sarh-banners.controller';
import { ExploreSarhBannersController } from './explore-sarh-banners.controller';
import { ExploreSarhBannersService } from './explore-sarh-banners.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    ExploreSarhBannersController,
    AdminExploreSarhBannersController,
  ],
  providers: [ExploreSarhBannersService],
  exports: [ExploreSarhBannersService],
})
export class ExploreSarhBannersModule {}
