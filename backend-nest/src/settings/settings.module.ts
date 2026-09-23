import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaidServicesService } from './paid-services.service';
import { SettingsController } from './settings.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SettingsController],
  providers: [PaidServicesService],
  exports: [PaidServicesService],
})
export class SettingsModule {}
