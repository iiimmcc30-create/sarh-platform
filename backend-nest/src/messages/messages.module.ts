import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { MessagingPolicyService } from './services/messaging-policy.service';
import { MessagesRepository } from './repositories/messages.repository';
import { GatewaySharedModule } from '../gateway/gateway-shared.module';

@Module({
  imports: [GatewaySharedModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesRepository, MessagingPolicyService],
  exports: [MessagesService, MessagingPolicyService],
})
export class MessagesModule {}
