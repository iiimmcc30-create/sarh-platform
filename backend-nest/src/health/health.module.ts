import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService, HealthRepository } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService, HealthRepository],
})
export class HealthModule {}
