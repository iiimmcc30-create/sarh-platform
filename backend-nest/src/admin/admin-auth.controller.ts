import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public, RateLimit, Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { successResponse } from '../common/utils/response.util';
import type { JwtPayload } from '../common/types/jwt-payload.interface';
import type { AdminLoginDto } from './dto/admin.dto';
import { AdminAuthService } from './services/admin-auth.service';
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  buildAdminSessionCookies,
  buildClearAdminSessionCookies,
  hasAdminCsrfHeader,
  readCookie,
  shouldUseSecureCookie,
} from '../common/lib/admin-session-cookie';

const STAFF = ['ADMIN', 'MODERATOR'] as const;

/**
 * Admin panel authentication. The panel (sends `X-Requested-With: sarh-admin`)
 * gets HttpOnly cookies only; other clients (live e2e scripts) keep receiving
 * the tokens in the body as before.
 */
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  private setSession(
    req: Request,
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) {
    res.append(
      'Set-Cookie',
      buildAdminSessionCookies(tokens, shouldUseSecureCookie(req)),
    );
    res.setHeader('Cache-Control', 'no-store');
  }

  private clearSession(req: Request, res: Response) {
    res.append(
      'Set-Cookie',
      buildClearAdminSessionCookies(shouldUseSecureCookie(req)),
    );
    res.setHeader('Cache-Control', 'no-store');
  }

  @Public()
  @RateLimit('auth')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: AdminLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(body, req);
    this.setSession(req, res, result);
    if (hasAdminCsrfHeader(req.headers)) {
      return successResponse({ user: result.user });
    }
    return successResponse(result);
  }

  @Public()
  @RateLimit('auth')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const result = await this.auth.refresh(
        readCookie(req.headers.cookie, ADMIN_REFRESH_COOKIE),
      );
      this.setSession(req, res, result);
      return successResponse({ user: result.user });
    } catch (err) {
      this.clearSession(req, res);
      throw err;
    }
  }

  @Public()
  @RateLimit('api')
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
    const result = await this.auth.logout(
      readCookie(req.headers.cookie, ADMIN_ACCESS_COOKIE) ?? bearer,
      readCookie(req.headers.cookie, ADMIN_REFRESH_COOKIE),
    );
    this.clearSession(req, res);
    return successResponse(result);
  }

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('me')
  @HttpCode(HttpStatus.OK)
  async me(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.auth.me(user));
  }

  // ─── 2FA ──────────────────────────────────────────────────────────────────

  @Roles(...STAFF)
  @RateLimit('api')
  @Get('2fa')
  @HttpCode(HttpStatus.OK)
  async twoFactorStatus(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.auth.twoFactorStatus(user));
  }

  @Roles(...STAFF)
  @RateLimit('auth')
  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  async twoFactorSetup(@CurrentUser() user: JwtPayload) {
    return successResponse(await this.auth.twoFactorSetup(user));
  }

  @Roles(...STAFF)
  @RateLimit('auth')
  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  async twoFactorEnable(
    @CurrentUser() user: JwtPayload,
    @Body() body: { code?: string },
  ) {
    return successResponse(await this.auth.twoFactorEnable(user, body?.code));
  }

  @Roles(...STAFF)
  @RateLimit('auth')
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  async twoFactorDisable(
    @CurrentUser() user: JwtPayload,
    @Body() body: { code?: string },
  ) {
    return successResponse(await this.auth.twoFactorDisable(user, body?.code));
  }

  @Roles('ADMIN')
  @RateLimit('api')
  @Post('2fa/reset/:userId')
  @HttpCode(HttpStatus.OK)
  async twoFactorReset(
    @CurrentUser() user: JwtPayload,
    @Param('userId') userId: string,
  ) {
    return successResponse(await this.auth.twoFactorReset(user, userId));
  }
}
