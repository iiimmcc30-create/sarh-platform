import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RateLimit } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { UserSettingsService } from './services/user-settings.service';
import { SetMuteDto, UpdateNotificationPrefsDto } from './dto/user-settings.dto';

/** Settings redesign endpoints (auth required, own data only). */
@Controller('users')
export class UserSettingsController {
  constructor(private readonly settings: UserSettingsService) {}

  @RateLimit('api')
  @Get('me/notification-prefs')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  async getNotificationPrefs(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.settings.getNotificationPrefs(user.userId));
  }

  @RateLimit('api')
  @Patch('me/notification-prefs')
  @HttpCode(HttpStatus.OK)
  async updateNotificationPrefs(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateNotificationPrefsDto,
  ) {
    return successResponse(await this.settings.updateNotificationPrefs(user.userId, dto));
  }

  @RateLimit('api')
  @Get('me/muted')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  async listMuted(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.settings.listMuted(user.userId));
  }

  @RateLimit('api')
  @Post(':id/mute')
  @HttpCode(HttpStatus.OK)
  async setMute(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SetMuteDto,
  ) {
    return successResponse(await this.settings.setMute(id, user.userId, dto.muted));
  }

  @RateLimit('api')
  @Get('me/sessions')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  async listSessions(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.settings.listSessions(user.userId));
  }

  @RateLimit('api')
  @Get('me/payments')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  async listPayments(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.settings.listPayments(user.userId));
  }

  @RateLimit('api')
  @Get('me/export')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  async exportData(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.settings.exportData(user.userId));
  }
}
