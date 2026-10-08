import { Controller, Get, Header, HttpCode, HttpStatus } from '@nestjs/common';
import { RateLimit } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { ProfileViewsService } from './services/profile-views.service';

/** «مين شاف ملفي» — the signed-in user's own profile viewers (auth required). */
@Controller('users/me/profile-views')
export class ProfileViewsController {
  constructor(private readonly views: ProfileViewsService) {}

  @RateLimit('api')
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  async list(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.views.listForOwner(user.userId));
  }
}
