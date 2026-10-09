import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import jwt from 'jsonwebtoken';
import {
  IS_PUBLIC_KEY,
  OPTIONAL_AUTH_KEY,
} from '../../common/decorators/auth.decorators';
import { RedisSessionService } from '../../redis/services/redis-session.service';
import { AuthRepository } from '../repositories/auth.repository';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import {
  ADMIN_ACCESS_COOKIE,
  hasAdminCsrfHeader,
  isStaffRole,
  readCookie,
} from '../../common/lib/admin-session-cookie';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private sessions: RedisSessionService,
    private authRepo: AuthRepository,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const optional = this.reflector.getAllAndOverride<boolean>(
      OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Purely public routes skip authentication. Public + OptionalAuth routes
    // must still parse a supplied Bearer token so viewer-specific fields such
    // as `isFollowing` are resolved from PostgreSQL.
    if (isPublic && !optional) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const authHeader = req.headers.authorization;

    // Admin panel: HttpOnly session cookie, only when no Bearer header is sent
    // and the request carries the panel's CSRF header. App (Bearer) auth is
    // unchanged.
    const adminCookieToken =
      !authHeader?.startsWith('Bearer ') && hasAdminCsrfHeader(req.headers)
        ? readCookie(req.headers.cookie, ADMIN_ACCESS_COOKIE)
        : undefined;

    if (!authHeader?.startsWith('Bearer ') && !adminCookieToken) {
      if (optional || isPublic) return true;
      throw new UnauthorizedException({
        success: false,
        error: 'unauthorized',
        messageAr: 'غير مصرح',
      });
    }

    const token = adminCookieToken ?? authHeader!.slice(7);

    try {
      const secret = process.env.JWT_SECRET!;
      const payload = jwt.verify(token, secret) as JwtPayload;

      if (adminCookieToken && !isStaffRole(payload.role)) {
        throw new UnauthorizedException({
          success: false,
          error: 'unauthorized',
          messageAr: 'غير مصرح',
        });
      }

      const blacklisted = await this.sessions.get<boolean>(
        `blacklist:${token}`,
      );
      if (blacklisted) {
        throw new UnauthorizedException({
          success: false,
          error: 'token_revoked',
          messageAr: 'انتهت الجلسة',
        });
      }

      const user = await this.authRepo.getPasswordVersion(payload.userId);
      if (!user || (payload.passwordVersion ?? 0) !== user.passwordVersion) {
        throw new UnauthorizedException({
          success: false,
          error: 'token_revoked',
          messageAr: 'انتهت الجلسة',
        });
      }

      if (!user.isActive) {
        throw new UnauthorizedException({
          success: false,
          error: 'token_revoked',
          messageAr: 'انتهت الجلسة',
        });
      }

      req.user = payload;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException({
          success: false,
          error: 'token_expired',
          messageAr: 'انتهت صلاحية الجلسة',
        });
      }
      throw new UnauthorizedException({
        success: false,
        error: 'invalid_token',
        messageAr: 'رمز غير صالح',
      });
    }
  }
}
