import { Module } from '@nestjs/common';
import { CouncilsController } from './councils.controller';
import { CouncilsService } from './councils.service';
import { CouncilsCoreModule } from './councils-core.module';
import { CouncilAgoraModerationService } from './services/council-agora-moderation.service';
import { CouncilScheduleService } from './services/council-schedule.service';

/** «المجالس» REST API (runs in the API process). */
@Module({
  imports: [CouncilsCoreModule],
  controllers: [CouncilsController],
  providers: [
    CouncilsService,
    CouncilAgoraModerationService,
    CouncilScheduleService,
  ],
})
export class CouncilsModule {}
