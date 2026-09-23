import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminMinistryController } from './admin-ministry.controller';
import { AdminOfficialServicesController } from './admin-official-services.controller';
import { OfficialServicesController } from './official-services.controller';
import { OfficialServicesService } from './official-services.service';
import { OfficialServicesRepository } from './repositories/official-services.repository';

@Module({
  imports: [PrismaModule],
  controllers: [
    OfficialServicesController,
    AdminOfficialServicesController,
    AdminMinistryController,
  ],
  providers: [OfficialServicesService, OfficialServicesRepository],
  exports: [OfficialServicesService],
})
export class OfficialServicesModule {}
