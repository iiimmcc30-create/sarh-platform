import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../settings/settings.module';
import { AdminHomeExploreController } from './admin-home-explore.controller';
import { HomeExploreController } from './home-explore.controller';
import { HomeExploreService } from './home-explore.service';

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [HomeExploreController, AdminHomeExploreController],
  providers: [HomeExploreService],
  exports: [HomeExploreService],
})
export class HomeExploreModule {}
