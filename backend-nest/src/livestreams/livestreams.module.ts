import { Module } from '@nestjs/common';
import { LivestreamsController } from './livestreams.controller';
import { LivestreamsService } from './livestreams.service';
import { LivestreamsRepository } from './repositories/livestreams.repository';

@Module({
  controllers: [LivestreamsController],
  providers: [LivestreamsService, LivestreamsRepository],
})
export class LivestreamsModule {}
