import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './services/users.service';
import { UsersRepository } from './repositories/users.repository';
import { ProfileViewsController } from './profile-views.controller';
import { ProfileViewsService } from './services/profile-views.service';
import { RedisModule } from '../redis/redis.module';
import { GatewaySharedModule } from '../gateway/gateway-shared.module';

@Module({
  imports: [RedisModule, GatewaySharedModule],
  controllers: [ProfileViewsController, UsersController],
  providers: [UsersService, UsersRepository, ProfileViewsService],
  exports: [UsersRepository],
})
export class UsersModule {}
