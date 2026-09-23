import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminRepository } from './repositories/admin.repository';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [AuthModule, CommonModule, RedisModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository],
})
export class AdminModule {}
