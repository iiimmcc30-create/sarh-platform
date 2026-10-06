import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { GatewaySharedModule } from '../gateway/gateway-shared.module';
import { CouncilPresenceService } from './services/council-presence.service';
import { CouncilRealtimeService } from './services/council-realtime.service';

/**
 * «المجالس» pieces shared by the API (CouncilsModule) and the socket process
 * (GatewayModule): presence + realtime fan-out. Prisma/Redis modules are global.
 */
@Module({
  imports: [CommonModule, GatewaySharedModule],
  providers: [CouncilPresenceService, CouncilRealtimeService],
  exports: [CouncilPresenceService, CouncilRealtimeService],
})
export class CouncilsCoreModule {}
