import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './services/admin-auth.service';
import { AdminService } from './admin.service';
import { AdminRepository } from './repositories/admin.repository';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [AuthModule, CommonModule, RedisModule],
  controllers: [AdminAuthController, AdminController],
  providers: [AdminService, AdminAuthService, AdminRepository],
})
export class AdminModule {}
