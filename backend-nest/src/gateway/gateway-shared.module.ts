import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { SocketDisconnectService } from './services/socket-disconnect.service';
import { SocketEmitService } from './services/socket-emit.service';

@Module({
  imports: [CommonModule],
  providers: [SocketDisconnectService, SocketEmitService],
  exports: [SocketDisconnectService, SocketEmitService],
})
export class GatewaySharedModule {}
