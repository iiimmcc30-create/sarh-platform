import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { AppConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';
import { MessagesModule } from '../messages/messages.module';
import { SupportModule } from '../support/support.module';
import { AppGateway } from './app.gateway';
import { GatewaySharedModule } from './gateway-shared.module';
import { SocketHealthController } from './socket-health.controller';
import { SocketRepository } from './repositories/socket.repository';
import { SocketDisconnectListenerService } from './services/socket-disconnect-listener.service';
import { SocketGatewayService } from './services/socket-gateway.service';
import { SocketRedisAdapterService } from './services/socket-redis-adapter.service';

@Module({
  imports: [
    AppConfigModule,
    CommonModule,
    PrismaModule,
    RedisModule,
    QueueModule,
    MessagesModule,
    SupportModule,
    GatewaySharedModule,
    AuthModule,
  ],
  controllers: [SocketHealthController],
  providers: [
    SocketRepository,
    SocketGatewayService,
    AppGateway,
    SocketDisconnectListenerService,
    SocketRedisAdapterService,
  ],
})
export class GatewayModule {}
