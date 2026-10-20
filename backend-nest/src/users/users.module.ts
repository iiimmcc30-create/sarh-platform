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
import { ReportsModule } from '../reports/reports.module';
import { UserReviewsController } from './reviews/user-reviews.controller';
import { AdminUserReviewsController } from './reviews/admin-user-reviews.controller';
import { UserReviewsService } from './reviews/user-reviews.service';
import { UserReviewsRepository } from './reviews/user-reviews.repository';

@Module({
  imports: [RedisModule, GatewaySharedModule, ReportsModule],
  // UserSettingsController first: its `me/...` routes must win over `:id`.
  controllers: [
    ProfileViewsController,
    UserSettingsController,
    UserReviewsController,
    AdminUserReviewsController,
    UsersController,
  ],
  providers: [
    UsersService,
    UsersRepository,
    ProfileViewsService,
    UserSettingsService,
    UserReviewsService,
    UserReviewsRepository,
  ],
  exports: [UsersRepository],
})
export class UsersModule {}
