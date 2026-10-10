import { Module } from '@nestjs/common';
import { FeesController } from './fees.controller';
import { FeesService } from './fees.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [FeesController],
  providers: [FeesService],
  exports: [FeesService],
})
export class FeesModule {}
