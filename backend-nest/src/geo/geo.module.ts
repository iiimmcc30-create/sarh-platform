import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SaudiCitiesService } from './saudi-cities.service';
import { ListingGeoBackfillService } from './listing-geo-backfill.service';

@Module({
  imports: [PrismaModule],
  providers: [SaudiCitiesService, ListingGeoBackfillService],
  exports: [SaudiCitiesService],
})
export class GeoModule {}
