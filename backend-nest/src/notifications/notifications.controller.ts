import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RateLimit } from '../common/decorators/auth.decorators';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('cursor') cursor?: string,
  ) {
    return successResponse(await this.notifications.list(user.userId, cursor));
  }

  @RateLimit('api')
  @Patch()
  @HttpCode(HttpStatus.OK)
  async markRead(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return successResponse(
      await this.notifications.markRead(user.userId, body),
    );
  }

  @RateLimit('api')
  @Get('unread-count')
  @HttpCode(HttpStatus.OK)
  async unreadCount(@CurrentUser() user: JwtPayload) {
    return successResponse(
      await this.notifications.getUnreadCount(user.userId),
    );
  }
}
