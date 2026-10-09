import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminRepository } from '../repositories/admin.repository';
import { JwtTokenService } from '../../auth/services/jwt-token.service';
import { AuthRepository } from '../../auth/repositories/auth.repository';
import { RedisSessionService } from '../../redis/services/redis-session.service';
import { RedisCacheService } from '../../redis/services/redis-cache.service';
import { LoggerService } from '../../common/services/logger.service';
import { throwApi } from '../../common/exceptions/api.exception';
import { isStaffRole } from '../../common/lib/admin-session-cookie';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { adminLoginSchema, type AdminLoginDto } from '../dto/admin.dto';
import {
  clearLoginFailures,
  lockedForSeconds,
  recordLoginFailure,
  type LockoutRedis,
} from '../lib/admin-login-lockout';
import { buildOtpAuthUrl, generateTotpSecret, verifyTotp } from '../lib/totp';
import { openSecret, sealSecret } from '../lib/secret-box';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ACCESS_BLACKLIST_SEC = 15 * 60;

export type AdminUserView = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  arabicName: string;
  avatar: string | null;
  role: 'ADMIN' | 'MODERATOR';
};

export type AdminSessionTokens = { accessToken: string; refreshToken: string };

export function formatAdminUser(user: {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  arabicName: string;
  avatar: string | null;
  role: string;
}): AdminUserView {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    arabicName: user.arabicName,
    avatar: user.avatar,
    role: user.role as 'ADMIN' | 'MODERATOR',
  };
}

type TwoFactorRow = {
  userId: string;
  secretSealed: string;
  enabledAt: Date | null;
  lastUsedStep: number | null;
};

function isMissingTable(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'P2021';
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: AdminRepository,
    private readonly jwt: JwtTokenService,
    private readonly authRepo: AuthRepository,
    private readonly sessions: RedisSessionService,
    private readonly cache: RedisCacheService,
    private readonly logger: LoggerService,
  ) {}

  // ─── helpers ──────────────────────────────────────────────────────────────

  private lockoutRedis(): LockoutRedis | null {
    try {
      if (!this.cache.isEnabled()) return null;
      const client = this.cache.getClient();
      return client.status === 'ready'
        ? (client as unknown as LockoutRedis)
        : null;
    } catch {
      return null;
    }
  }

  private sessionMeta(req: Request) {
    return {
      ipAddress: req.socket?.remoteAddress,
      deviceInfo: req.headers['user-agent']?.slice(0, 200),
    };
  }

  /**
   * 2FA row for a user. A missing table (migration not applied yet) is
   * treated as "2FA not configured" so admin login keeps working.
   */
  private async findTwoFactor(userId: string): Promise<TwoFactorRow | null> {
    try {
      return await this.prisma.adminTwoFactor.findUnique({
        where: { userId },
      });
    } catch (err) {
      if (isMissingTable(err)) {
        this.logger.warn(
          { userId },
          'AdminTwoFactor table missing — apply migration 20261009170000_admin_two_factor',
        );
        return null;
      }
      throw err;
    }
  }

  private verifyRowCode(row: TwoFactorRow, code: unknown): number | null {
    let secret: string;
    try {
      secret = openSecret(row.secretSealed);
    } catch (err) {
      this.logger.error(
        { userId: row.userId, err: err instanceof Error ? err.message : err },
        'Admin 2FA secret could not be decrypted (ADMIN_TOTP_ENC_KEY / JWT_SECRET changed?)',
      );
      throwApi(
        500,
        'two_factor_unavailable',
        'تعذّر التحقق بخطوتين، تواصل مع المسؤول',
      );
    }
    return verifyTotp(secret, code, { afterStep: row.lastUsedStep });
  }

  private async markStepUsed(userId: string, step: number): Promise<void> {
    await this.prisma.adminTwoFactor.update({
      where: { userId },
      data: { lastUsedStep: step },
    });
  }

  // ─── login / session ──────────────────────────────────────────────────────

  async login(
    dto: AdminLoginDto | Record<string, unknown>,
    req: Request,
  ): Promise<{ user: AdminUserView } & AdminSessionTokens> {
    const parsed = adminLoginSchema.safeParse(dto ?? {});
    if (!parsed.success) {
      throwApi(
        400,
        'validation_error',
        'أدخل اسم المستخدم أو البريد وكلمة المرور',
        parsed.error.flatten(),
      );
    }
    const { login, password, otp } = parsed.data;
    const redis = this.lockoutRedis();

    const locked = await lockedForSeconds(redis, login);
    if (locked > 0) {
      throwApi(
        429,
        'login_locked',
        `تم إيقاف الدخول مؤقتاً بسبب محاولات خاطئة متكررة. حاول بعد ${Math.max(1, Math.ceil(locked / 60))} دقيقة.`,
      );
    }

    const user = await this.repo.findAdminUserForLogin(login);
    const dummyHash = '$2a$12$dummyhashfordummypassword1234567890abcdef';
    const valid = await bcrypt.compare(
      password,
      user?.passwordHash ?? dummyHash,
    );

    if (!user || !valid || !isStaffRole(user.role)) {
      await recordLoginFailure(redis, login);
      throwApi(401, 'invalid_credentials', 'بيانات الدخول غير صحيحة');
    }

    const twoFactor = await this.findTwoFactor(user.id);
    if (twoFactor?.enabledAt) {
      if (!otp) {
        throwApi(401, 'otp_required', 'أدخل رمز التحقق من تطبيق المصادقة');
      }
      const step = this.verifyRowCode(twoFactor, otp);
      if (step === null) {
        await recordLoginFailure(redis, login);
        throwApi(401, 'invalid_otp', 'رمز التحقق غير صحيح أو منتهي');
      }
      await this.markStepUsed(user.id, step);
    }

    await clearLoginFailures(redis, login);

    const count = await this.authRepo.countUserSessions(user.id);
    if (count >= 5) {
      const oldest = await this.authRepo.findOldestSession(user.id);
      if (oldest) await this.authRepo.deleteSession(oldest.id);
    }

    const accessToken = this.jwt.signAccessToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      passwordVersion: user.passwordVersion,
    });
    const refreshToken = this.jwt.signRefreshToken(user.id);

    await this.authRepo.loginTransaction(user.id, {
      refreshToken,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ...this.sessionMeta(req),
    });

    this.logger.info(
      { userId: user.id, role: user.role, twoFactor: !!twoFactor?.enabledAt },
      'Admin logged in',
    );
    return { user: formatAdminUser(user), accessToken, refreshToken };
  }

  /**
   * Rotate the panel session from the HttpOnly refresh cookie. Only staff
   * sessions can be refreshed here. A replayed (already rotated) refresh
   * token is rejected without wiping the user's other sessions, so two open
   * panel tabs refreshing at once cannot log the admin out of the app.
   */
  async refresh(
    refreshToken: string | undefined,
  ): Promise<{ user: AdminUserView } & AdminSessionTokens> {
    if (!refreshToken) {
      throwApi(401, 'no_session', 'انتهت الجلسة، سجّل الدخول مجدداً');
    }
    let decoded: { userId: string };
    try {
      decoded = this.jwt.verifyRefreshToken(refreshToken);
    } catch {
      throwApi(401, 'invalid_refresh', 'انتهت الجلسة، سجّل الدخول مجدداً');
    }

    const session = await this.authRepo.findSessionByRefreshToken(refreshToken);
    if (!session || session.user.id !== decoded.userId) {
      this.logger.warn(
        { userId: decoded.userId },
        'Admin refresh with unknown/rotated token',
      );
      throwApi(401, 'invalid_refresh', 'انتهت الجلسة، سجّل الدخول مجدداً');
    }
    if (session.expiresAt < new Date()) {
      await this.authRepo.deleteSession(session.id);
      throwApi(401, 'session_expired', 'انتهت الجلسة، سجّل الدخول مجدداً');
    }
    if (!session.user.isActive || !isStaffRole(session.user.role)) {
      throwApi(401, 'forbidden', 'غير مسموح');
    }

    const record = await this.repo.findUserById(session.user.id);
    if (!record || !isStaffRole(record.role)) {
      throwApi(401, 'forbidden', 'غير مسموح');
    }

    const accessToken = this.jwt.signAccessToken({
      userId: session.user.id,
      username: session.user.username,
      role: session.user.role,
      passwordVersion: session.user.passwordVersion,
    });
    const nextRefresh = this.jwt.signRefreshToken(session.user.id);
    await this.authRepo.rotateSession(
      session.id,
      nextRefresh,
      new Date(Date.now() + SESSION_TTL_MS),
    );
    return {
      user: formatAdminUser(record),
      accessToken,
      refreshToken: nextRefresh,
    };
  }

  /** Best-effort server-side logout; cookies are cleared by the controller. */
  async logout(
    accessToken: string | undefined,
    refreshToken: string | undefined,
  ): Promise<{ loggedOut: true }> {
    if (accessToken) {
      try {
        this.jwt.verifyAccessToken(accessToken);
        await this.sessions.set(
          `blacklist:${accessToken}`,
          true,
          ACCESS_BLACKLIST_SEC,
        );
      } catch {
        /* expired / invalid: nothing to revoke */
      }
    }
    if (refreshToken) {
      try {
        const { userId } = this.jwt.verifyRefreshToken(refreshToken);
        await this.authRepo.deleteSessionsByRefreshToken(userId, refreshToken);
      } catch {
        /* already invalid */
      }
    }
    return { loggedOut: true };
  }

  async me(user: JwtPayload): Promise<{ user: AdminUserView }> {
    const record = await this.repo.findUserById(user.userId);
    if (!record || !isStaffRole(record.role)) {
      throwApi(403, 'forbidden', 'غير مسموح');
    }
    return { user: formatAdminUser(record) };
  }

  // ─── TOTP two-factor (optional per admin) ────────────────────────────────

  async twoFactorStatus(
    user: JwtPayload,
  ): Promise<{ enabled: boolean; pending: boolean }> {
    const row = await this.findTwoFactor(user.userId);
    return { enabled: !!row?.enabledAt, pending: !!row && !row.enabledAt };
  }

  /** Start (or restart) enrolment: returns a fresh secret + otpauth URL. */
  async twoFactorSetup(
    user: JwtPayload,
  ): Promise<{ secret: string; otpauthUrl: string }> {
    const existing = await this.findTwoFactor(user.userId);
    if (existing?.enabledAt) {
      throwApi(409, 'two_factor_enabled', 'التحقق بخطوتين مفعّل مسبقاً');
    }
    const secret = generateTotpSecret();
    const secretSealed = sealSecret(secret);
    await this.prisma.adminTwoFactor.upsert({
      where: { userId: user.userId },
      create: { userId: user.userId, secretSealed },
      update: { secretSealed, enabledAt: null, lastUsedStep: null },
    });
    return {
      secret,
      otpauthUrl: buildOtpAuthUrl(secret, user.username || user.userId),
    };
  }

  async twoFactorEnable(
    user: JwtPayload,
    code: unknown,
  ): Promise<{ enabled: true }> {
    const row = await this.findTwoFactor(user.userId);
    if (!row) {
      throwApi(400, 'two_factor_not_started', 'ابدأ الإعداد أولاً');
    }
    if (row.enabledAt) {
      throwApi(409, 'two_factor_enabled', 'التحقق بخطوتين مفعّل مسبقاً');
    }
    const step = this.verifyRowCode(row, code);
    if (step === null) {
      throwApi(400, 'invalid_otp', 'رمز التحقق غير صحيح أو منتهي');
    }
    await this.prisma.adminTwoFactor.update({
      where: { userId: user.userId },
      data: { enabledAt: new Date(), lastUsedStep: step },
    });
    this.logger.info({ userId: user.userId }, 'Admin 2FA enabled');
    return { enabled: true };
  }

  async twoFactorDisable(
    user: JwtPayload,
    code: unknown,
  ): Promise<{ enabled: false }> {
    const row = await this.findTwoFactor(user.userId);
    if (!row?.enabledAt) {
      if (row) {
        await this.prisma.adminTwoFactor.delete({
          where: { userId: user.userId },
        });
      }
      return { enabled: false };
    }
    const step = this.verifyRowCode(row, code);
    if (step === null) {
      throwApi(400, 'invalid_otp', 'رمز التحقق غير صحيح أو منتهي');
    }
    await this.prisma.adminTwoFactor.delete({ where: { userId: user.userId } });
    this.logger.info({ userId: user.userId }, 'Admin 2FA disabled');
    return { enabled: false };
  }

  /** ADMIN-only recovery when a staff member loses their authenticator. */
  async twoFactorReset(
    actor: JwtPayload,
    targetUserId: string,
  ): Promise<{ reset: boolean }> {
    if (actor.role !== 'ADMIN') throwApi(403, 'forbidden', 'غير مسموح');
    try {
      const res = await this.prisma.adminTwoFactor.deleteMany({
        where: { userId: targetUserId },
      });
      this.logger.info(
        { actorId: actor.userId, targetUserId },
        'Admin 2FA reset by admin',
      );
      return { reset: res.count > 0 };
    } catch (err) {
      if (isMissingTable(err)) return { reset: false };
      throw err;
    }
  }
}
