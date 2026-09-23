import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './services/users.service';
import { UsersRepository } from './repositories/users.repository';
import { RedisModule } from '../redis/redis.module';
import { GatewaySharedModule } from '../gateway/gateway-shared.module';

@Module({
  imports: [RedisModule, GatewaySharedModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
