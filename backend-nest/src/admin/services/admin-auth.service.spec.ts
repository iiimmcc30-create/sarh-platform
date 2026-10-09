import bcrypt from 'bcryptjs';
import { AdminAuthService } from './admin-auth.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { generateTotpSecret, hotp, totpStep } from '../lib/totp';
import { sealSecret } from '../lib/secret-box';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(40);

const HASH = bcrypt.hashSync('pw-correct', 4);

function adminUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'admin-1',
    username: 'admin',
    email: 'a@x.sa',
    displayName: 'Admin',
    arabicName: 'مسؤول',
    avatar: null,
    role: 'ADMIN',
    passwordHash: HASH,
    passwordVersion: 0,
    ...overrides,
  };
}

function setup(opts: { twoFactor?: unknown; twoFactorError?: unknown } = {}) {
  const redisStore = new Map<string, number>();
  const redisClient = {
    status: 'ready',
    get: jest.fn(async (k: string) =>
      redisStore.has(k) ? String(redisStore.get(k)) : null,
    ),
    incr: jest.fn(async (k: string) => {
      const n = (redisStore.get(k) ?? 0) + 1;
      redisStore.set(k, n);
      return n;
    }),
    expire: jest.fn(async () => 1),
    ttl: jest.fn(async () => 600),
    del: jest.fn(async (k: string) => redisStore.delete(k)),
  };
  const prisma = {
    adminTwoFactor: {
      findUnique: opts.twoFactorError
        ? jest.fn().mockRejectedValue(opts.twoFactorError)
        : jest.fn().mockResolvedValue(opts.twoFactor ?? null),
      update: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const repo = {
    findAdminUserForLogin: jest.fn().mockResolvedValue(adminUser()),
    findUserById: jest.fn().mockResolvedValue(adminUser()),
  };
  const jwt = {
    signAccessToken: jest.fn().mockReturnValue('access'),
    signRefreshToken: jest.fn().mockReturnValue('refresh'),
    verifyRefreshToken: jest.fn().mockReturnValue({ userId: 'admin-1' }),
    verifyAccessToken: jest.fn().mockReturnValue({ userId: 'admin-1' }),
  };
  const authRepo = {
    countUserSessions: jest.fn().mockResolvedValue(0),
    findOldestSession: jest.fn(),
    deleteSession: jest.fn(),
    loginTransaction: jest.fn().mockResolvedValue([]),
    findSessionByRefreshToken: jest.fn(),
    rotateSession: jest.fn().mockResolvedValue({}),
    deleteAllSessions: jest.fn(),
    deleteSessionsByRefreshToken: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const sessions = { set: jest.fn() };
  const cache = {
    isEnabled: () => true,
    getClient: () => redisClient,
  };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const service = new AdminAuthService(
    prisma as never,
    repo as never,
    jwt as never,
    authRepo as never,
    sessions as never,
    cache as never,
    logger as never,
  );
  const req = { socket: { remoteAddress: '1.2.3.4' }, headers: {} } as never;
  return { service, prisma, repo, jwt, authRepo, sessions, redisStore, req };
}

async function apiError(p: Promise<unknown>): Promise<ApiException> {
  try {
    await p;
  } catch (err) {
    if (err instanceof ApiException) return err;
    throw err;
  }
  throw new Error('expected ApiException');
}

describe('AdminAuthService.login', () => {
  it('logs in without 2FA and returns tokens', async () => {
    const { service, authRepo, req } = setup();
    const res = await service.login(
      { login: 'admin', password: 'pw-correct' },
      req,
    );
    expect(res.accessToken).toBe('access');
    expect(res.user.role).toBe('ADMIN');
    expect(authRepo.loginTransaction).toHaveBeenCalled();
  });

  it('rejects a wrong password and counts the failure', async () => {
    const { service, redisStore, req } = setup();
    const err = await apiError(
      service.login({ login: 'admin', password: 'nope' }, req),
    );
    expect(err.error).toBe('invalid_credentials');
    expect([...redisStore.values()]).toEqual([1]);
  });

  it('locks the account after 5 failures (even with the right password)', async () => {
    const { service, req } = setup();
    for (let i = 0; i < 5; i += 1) {
      await apiError(service.login({ login: 'admin', password: 'x' }, req));
    }
    const err = await apiError(
      service.login({ login: 'admin', password: 'pw-correct' }, req),
    );
    expect(err.error).toBe('login_locked');
  });

  it('requires and verifies a TOTP code when 2FA is enabled', async () => {
    const secret = generateTotpSecret();
    const row = {
      userId: 'admin-1',
      secretSealed: sealSecret(secret),
      enabledAt: new Date(),
      lastUsedStep: null,
    };
    const { service, prisma, req } = setup({ twoFactor: row });

    const missing = await apiError(
      service.login({ login: 'admin', password: 'pw-correct' }, req),
    );
    expect(missing.error).toBe('otp_required');

    const wrong = await apiError(
      service.login(
        {
          login: 'admin',
          password: 'pw-correct',
          otp: hotp(secret, totpStep() + 5),
        },
        req,
      ),
    );
    expect(wrong.error).toBe('invalid_otp');

    const ok = await service.login(
      { login: 'admin', password: 'pw-correct', otp: hotp(secret, totpStep()) },
      req,
    );
    expect(ok.accessToken).toBe('access');
    expect(prisma.adminTwoFactor.update).toHaveBeenCalledWith({
      where: { userId: 'admin-1' },
      data: { lastUsedStep: expect.any(Number) },
    });
  });

  it('keeps login working if the 2FA table is not migrated yet', async () => {
    const { service, req } = setup({ twoFactorError: { code: 'P2021' } });
    const res = await service.login(
      { login: 'admin', password: 'pw-correct' },
      req,
    );
    expect(res.accessToken).toBe('access');
  });
});

describe('AdminAuthService.refresh / logout', () => {
  it('rotates a valid staff session', async () => {
    const { service, authRepo } = setup();
    authRepo.findSessionByRefreshToken.mockResolvedValue({
      id: 's1',
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'admin-1',
        username: 'admin',
        role: 'ADMIN',
        isActive: true,
        passwordVersion: 0,
      },
    });
    const res = await service.refresh('old');
    expect(res.refreshToken).toBe('refresh');
    expect(authRepo.rotateSession).toHaveBeenCalledWith(
      's1',
      'refresh',
      expect.any(Date),
    );
  });

  it('rejects a missing cookie and a rotated token without wiping sessions', async () => {
    const { service, authRepo } = setup();
    expect((await apiError(service.refresh(undefined))).error).toBe(
      'no_session',
    );
    authRepo.findSessionByRefreshToken.mockResolvedValue(null);
    expect((await apiError(service.refresh('stale'))).error).toBe(
      'invalid_refresh',
    );
    expect(authRepo.deleteAllSessions).not.toHaveBeenCalled();
  });

  it('refuses to refresh a non-staff session', async () => {
    const { service, authRepo } = setup();
    authRepo.findSessionByRefreshToken.mockResolvedValue({
      id: 's1',
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'admin-1',
        username: 'u',
        role: 'USER',
        isActive: true,
        passwordVersion: 0,
      },
    });
    expect((await apiError(service.refresh('t'))).error).toBe('forbidden');
  });

  it('logout blacklists the access token and deletes the session', async () => {
    const { service, sessions, authRepo } = setup();
    await service.logout('access', 'refresh');
    expect(sessions.set).toHaveBeenCalledWith('blacklist:access', true, 900);
    expect(authRepo.deleteSessionsByRefreshToken).toHaveBeenCalledWith(
      'admin-1',
      'refresh',
    );
  });
});

describe('AdminAuthService 2FA management', () => {
  const actor = {
    userId: 'admin-1',
    username: 'admin',
    role: 'ADMIN',
  } as never;

  it('setup → enable with a valid code', async () => {
    const { service, prisma } = setup();
    const { secret, otpauthUrl } = await service.twoFactorSetup(actor);
    expect(otpauthUrl).toContain(secret);
    const sealed = prisma.adminTwoFactor.upsert.mock.calls[0][0].create
      .secretSealed as string;
    prisma.adminTwoFactor.findUnique.mockResolvedValue({
      userId: 'admin-1',
      secretSealed: sealed,
      enabledAt: null,
      lastUsedStep: null,
    });
    await expect(
      service.twoFactorEnable(actor, hotp(secret, totpStep())),
    ).resolves.toEqual({ enabled: true });
  });

  it('refuses setup when already enabled', async () => {
    const { service } = setup({
      twoFactor: {
        userId: 'admin-1',
        secretSealed: 'x',
        enabledAt: new Date(),
        lastUsedStep: null,
      },
    });
    expect((await apiError(service.twoFactorSetup(actor))).error).toBe(
      'two_factor_enabled',
    );
  });

  it('only ADMIN can reset another staff member', async () => {
    const { service } = setup();
    const mod = { userId: 'm', username: 'm', role: 'MODERATOR' } as never;
    expect((await apiError(service.twoFactorReset(mod, 'x'))).error).toBe(
      'forbidden',
    );
    await expect(service.twoFactorReset(actor, 'x')).resolves.toEqual({
      reset: true,
    });
  });
});
