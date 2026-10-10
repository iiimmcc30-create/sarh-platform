import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AiAdminService } from '../ai-agents/admin/ai-admin.service';
import { RateLimit, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import { successResponse } from '../common/utils/response.util';

@Controller('admin/support/ai')
export class AdminAiController {
  constructor(private readonly admin: AiAdminService) {}

  @Roles('ADMIN')
  @RateLimit('api')
  @Get()
  @HttpCode(HttpStatus.OK)
  async dashboard() {
    return successResponse(await this.admin.dashboard());
  }

  @Roles('ADMIN')
  @RateLimit('api')
  @Post('flags')
  @HttpCode(HttpStatus.OK)
  async setFlag(
    @CurrentUser() admin: JwtPayload,
    @Body() body: { name?: string; enabled?: boolean },
  ) {
    if (typeof body?.enabled !== 'boolean' || !body.name) {
      return successResponse({ ok: false, reason: 'unknown' });
    }
    return successResponse(await this.admin.setFlag(admin, body.name, body.enabled));
  }

  @Roles('ADMIN')
  @RateLimit('api')
  @Post('tech-run')
  @HttpCode(HttpStatus.OK)
  async techRun(@CurrentUser() admin: JwtPayload) {
    return successResponse(await this.admin.runTech(admin));
  }
}
