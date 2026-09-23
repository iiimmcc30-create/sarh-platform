import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminButcherBannersController } from './admin-butcher-banners.controller';
import { ButcherBannersController } from './butcher-banners.controller';
import { ButcherBannersService } from './butcher-banners.service';

@Module({
  imports: [PrismaModule],
  controllers: [ButcherBannersController, AdminButcherBannersController],
  providers: [ButcherBannersService],
  exports: [ButcherBannersService],
})
export class ButcherBannersModule {}
