import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './services/users.service';
import { UsersRepository } from './repositories/users.repository';
import { ProfileViewsController } from './profile-views.controller';
import { ProfileViewsService } from './services/profile-views.service';
import { UserSettingsController } from './user-settings.controller';
import { UserSettingsService } from './services/user-settings.service';
import { RedisModule } from '../redis/redis.module';
import { GatewaySharedModule } from '../gateway/gateway-shared.module';

@Module({
  imports: [RedisModule, GatewaySharedModule],
  // UserSettingsController first: its `me/...` routes must win over `:id`.
  controllers: [
    ProfileViewsController,
    UserSettingsController,
    UsersController,
  ],
  providers: [
    UsersService,
    UsersRepository,
    ProfileViewsService,
    UserSettingsService,
  ],
  exports: [UsersRepository],
})
export class UsersModule {}
