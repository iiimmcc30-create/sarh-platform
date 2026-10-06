import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { SocketDisconnectService } from './services/socket-disconnect.service';
import { SocketEmitService } from './services/socket-emit.service';
import { CouncilSocketBridgeService } from './services/council-socket-bridge.service';

@Module({
  imports: [CommonModule],
  providers: [
    SocketDisconnectService,
    SocketEmitService,
    CouncilSocketBridgeService,
  ],
  exports: [
    SocketDisconnectService,
    SocketEmitService,
    CouncilSocketBridgeService,
  ],
})
export class GatewaySharedModule {}
