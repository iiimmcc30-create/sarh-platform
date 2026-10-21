import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './services/users.service';
import { UserReviewsService } from './services/user-reviews.service';
import { UsersRepository } from './repositories/users.repository';
import { ProfileViewsController } from './profile-views.controller';
import { ProfileViewsService } from './services/profile-views.service';
import { UserSettingsController } from './user-settings.controller';
import { UserSettingsService } from './services/user-settings.service';
import { ReviewCreateLimiter } from './lib/review-create-limiter';
import { RedisModule } from '../redis/redis.module';
import { GatewaySharedModule } from '../gateway/gateway-shared.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [RedisModule, GatewaySharedModule, ReportsModule],
  // UserSettingsController first: its `me/...` routes must win over `:id`.
  controllers: [
    ProfileViewsController,
    UserSettingsController,
    UsersController,
  ],
  providers: [
    UsersService,
    UserReviewsService,
    UsersRepository,
    ProfileViewsService,
    UserSettingsService,
    ReviewCreateLimiter,
  ],
  exports: [UsersRepository],
})
export class UsersModule {}
