import jwt from 'jsonwebtoken';
import {
  AuthService,
  SIGNUP_PHONE_TAKEN_AR,
  SIGNUP_USERNAME_TAKEN_AR,
} from './auth.service';
import { ApiException } from '../../common/exceptions/api.exception';

process.env.DEV_OTP = 'true';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-signup-jwt-secret-key-32chars!!';

function makeService(repoOverrides: Record<string, unknown> = {}) {
  const repo = {
    findUserForLogin: jest.fn(),
    findExistingUser: jest.fn().mockResolvedValue(null),
    findUserByPhone: jest.fn().mockResolvedValue(null),
    findAnyUserByPhone: jest.fn().mockResolvedValue(null),
    findAnyUserByUsername: jest.fn().mockResolvedValue(null),
    createUser: jest.fn(),
    createSession: jest.fn(),
    followKnowledgeCenter: jest.fn().mockResolvedValue(undefined),
    loginTransaction: jest.fn(),
    updateLastSeen: jest.fn(),
    countUserSessions: jest.fn().mockResolvedValue(0),
    ...repoOverrides,
  };

  const jwtService = {
    signAccessToken: jest.fn().mockReturnValue('access-token'),
    signRefreshToken: jest.fn().mockReturnValue('refresh-token'),
    verifyRefreshToken: jest.fn(),
  };

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return process.env.JWT_SECRET;
      return undefined;
    }),
  };

  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const service = new AuthService(
    repo as never,
    jwtService as never,
    { del: jest.fn(), set: jest.fn() } as never,
    logger as never,
    { disconnectUser: jest.fn() } as never,
    { enqueue: jest.fn() } as never,
    config as never,
  );

  return { service, repo, jwtService };
}

function signupPhoneToken(phone: string) {
  return jwt.sign(
    { phone, verified: true, purpose: 'signup' },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' },
  );
}

const PHONE_A = '+966512345678';
const PHONE_B = '+966587654321';
const PHONE_NEW = '+966511122233';

describe('AuthService signup uniqueness', () => {
  const req = {
    headers: { 'user-agent': 'jest' },
    socket: { remoteAddress: '127.0.0.1' },
  } as never;

  it('checkSignup rejects taken phone with exact Arabic message', async () => {
    const { service } = makeService({
      findAnyUserByPhone: jest.fn().mockResolvedValue({ id: 'user-a' }),
    });
    await expect(service.checkSignup({ phone: PHONE_A })).rejects.toMatchObject(
      {
        status: 409,
        error: 'phone_taken',
        messageAr: SIGNUP_PHONE_TAKEN_AR,
      },
    );
  });

  it('checkSignup rejects taken username with exact Arabic message', async () => {
    const { service } = makeService({
      findAnyUserByUsername: jest.fn().mockResolvedValue({ id: 'user-b' }),
    });
    await expect(
      service.checkSignup({ username: 'sarh' }),
    ).rejects.toMatchObject({
      status: 409,
      error: 'username_taken',
      messageAr: SIGNUP_USERNAME_TAKEN_AR,
    });
  });

  it('checkSignup allows free phone + username', async () => {
    const { service } = makeService();
    await expect(
      service.checkSignup({ phone: PHONE_NEW, username: 'newuser' }),
    ).resolves.toMatchObject({ available: true });
  });

  it('sendOtp(signup) rejects existing phone and does not proceed', async () => {
    const { service, repo } = makeService({
      findAnyUserByPhone: jest.fn().mockResolvedValue({ id: 'user-a' }),
    });
    await expect(
      service.sendOtp({ phone: PHONE_A, channel: 'sms', purpose: 'signup' }),
    ).rejects.toMatchObject({
      status: 409,
      error: 'phone_taken',
      messageAr: SIGNUP_PHONE_TAKEN_AR,
    });
    expect(repo.findAnyUserByPhone).toHaveBeenCalledWith(PHONE_A);
  });

  it('sendOtp(login) still works for existing phone', async () => {
    const { service } = makeService({
      findAnyUserByPhone: jest.fn().mockResolvedValue({ id: 'user-a' }),
    });
    await expect(
      service.sendOtp({ phone: PHONE_A, channel: 'sms', purpose: 'login' }),
    ).resolves.toMatchObject({ success: true, dev_mode: true });
  });

  it('verifyOtp(signup) rejects existing phone even with valid OTP — no session', async () => {
    const { service, jwtService } = makeService({
      findUserByPhone: jest.fn().mockResolvedValue({
        id: 'user-a',
        username: 'existing',
        phone: PHONE_A,
        isAI: false,
        role: 'USER',
        passwordVersion: 0,
        displayName: 'A',
        arabicName: 'A',
        email: null,
        avatar: null,
        verified: false,
        country: 'SA',
        subscription: null,
      }),
    });

    await expect(
      service.verifyOtp(
        { phone: PHONE_A, code: '123456', purpose: 'signup' },
        req,
      ),
    ).rejects.toMatchObject({
      status: 409,
      error: 'phone_taken',
      messageAr: SIGNUP_PHONE_TAKEN_AR,
    });
    expect(jwtService.signAccessToken).not.toHaveBeenCalled();
  });

  it('verifyOtp(signup) returns signup phone_token for new phone', async () => {
    const { service } = makeService();
    const result = await service.verifyOtp(
      { phone: PHONE_NEW, code: '123456', purpose: 'signup' },
      req,
    );
    expect(result).toMatchObject({
      verified: true,
      purpose: 'signup',
      is_new_user: true,
      phone: PHONE_NEW,
    });
    expect(result).toHaveProperty('phone_token');
    const decoded = jwt.verify(
      (result as { phone_token: string }).phone_token,
      process.env.JWT_SECRET!,
    ) as { purpose?: string };
    expect(decoded.purpose).toBe('signup');
  });

  it('verifyOtp(login) still logs into existing account', async () => {
    const existing = {
      id: 'user-a',
      username: 'existing',
      phone: PHONE_A,
      isAI: false,
      role: 'USER',
      passwordVersion: 0,
      displayName: 'A',
      arabicName: 'A',
      email: null,
      avatar: null,
      verified: false,
      country: 'SA',
      subscription: null,
    };
    const { service, repo, jwtService } = makeService({
      findUserByPhone: jest.fn().mockResolvedValue(existing),
    });
    const result = await service.verifyOtp(
      { phone: PHONE_A, code: '123456', purpose: 'login' },
      req,
    );
    expect(result).toMatchObject({
      verified: true,
      is_new_user: false,
      access_token: 'access-token',
    });
    expect(jwtService.signAccessToken).toHaveBeenCalled();
    expect(repo.loginTransaction).toHaveBeenCalled();
  });

  it('real-world scenario: phone X taken + username sarh taken → rejected at phone (no user create, no login)', async () => {
    const { service, repo, jwtService } = makeService({
      findAnyUserByPhone: jest.fn().mockResolvedValue({ id: 'user-a' }),
      findAnyUserByUsername: jest.fn().mockResolvedValue({ id: 'user-b' }),
      findUserByPhone: jest.fn().mockResolvedValue({
        id: 'user-a',
        username: 'other',
        phone: PHONE_A,
        isAI: false,
        role: 'USER',
        passwordVersion: 0,
        displayName: 'A',
        arabicName: 'A',
        email: null,
        avatar: null,
        verified: false,
        country: 'SA',
        subscription: null,
      }),
    });

    await expect(
      service.checkSignup({ phone: PHONE_A }),
    ).rejects.toBeInstanceOf(ApiException);

    await expect(
      service.sendOtp({ phone: PHONE_A, channel: 'sms', purpose: 'signup' }),
    ).rejects.toMatchObject({ error: 'phone_taken' });

    await expect(
      service.verifyOtp(
        { phone: PHONE_A, code: '123456', purpose: 'signup' },
        req,
      ),
    ).rejects.toMatchObject({ error: 'phone_taken' });

    expect(repo.createUser).not.toHaveBeenCalled();
    expect(jwtService.signAccessToken).not.toHaveBeenCalled();
  });

  it('new phone + taken username sarh → username rejected; no user created', async () => {
    const { service, repo } = makeService({
      findAnyUserByUsername: jest.fn().mockResolvedValue({ id: 'user-b' }),
      findExistingUser: jest
        .fn()
        .mockResolvedValue({ username: 'sarh', phone: PHONE_B }),
    });

    await expect(
      service.checkSignup({ username: 'sarh' }),
    ).rejects.toMatchObject({
      error: 'username_taken',
      messageAr: SIGNUP_USERNAME_TAKEN_AR,
    });

    await expect(
      service.register(
        {
          phone: PHONE_NEW,
          phone_token: signupPhoneToken(PHONE_NEW),
          displayName: 'aaa',
          username: 'sarh',
          password: 'secret12',
          country: 'SA',
        },
        req,
      ),
    ).rejects.toMatchObject({
      error: 'username_taken',
      messageAr: SIGNUP_USERNAME_TAKEN_AR,
    });
    expect(repo.createUser).not.toHaveBeenCalled();
  });

  it('register succeeds for new phone + new username', async () => {
    const created = {
      id: 'user-new',
      username: 'newuser',
      phone: PHONE_NEW,
      role: 'USER',
      passwordVersion: 0,
      displayName: 'aaa',
      arabicName: 'aaa',
      email: null,
      avatar: null,
      verified: false,
      country: 'SA',
      subscription: null,
    };
    const { service, repo } = makeService({
      createUser: jest.fn().mockResolvedValue(created),
    });

    const result = await service.register(
      {
        phone: PHONE_NEW,
        phone_token: signupPhoneToken(PHONE_NEW),
        displayName: 'aaa',
        username: 'newuser',
        password: 'secret12',
        country: 'SA',
      },
      req,
    );

    expect(repo.createUser).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      access_token: 'access-token',
      user: expect.objectContaining({ username: 'newuser', phone: PHONE_NEW }),
    });
  });

  it('register rejects login-purpose phone_token (cannot convert signup to login token)', async () => {
    const { service, repo } = makeService();
    const loginToken = jwt.sign(
      { phone: PHONE_NEW, verified: true, purpose: 'login' },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' },
    );
    await expect(
      service.register(
        {
          phone: PHONE_NEW,
          phone_token: loginToken,
          displayName: 'aaa',
          username: 'newuser',
          password: 'secret12',
        },
        req,
      ),
    ).rejects.toMatchObject({ error: 'invalid_phone_token' });
    expect(repo.createUser).not.toHaveBeenCalled();
  });

  it('register rejects phone_token without purpose', async () => {
    const { service, repo } = makeService();
    const bare = jwt.sign(
      { phone: PHONE_NEW, verified: true },
      process.env.JWT_SECRET!,
      { expiresIn: '15m' },
    );
    await expect(
      service.register(
        {
          phone: PHONE_NEW,
          phone_token: bare,
          displayName: 'aaa',
          username: 'newuser',
          password: 'secret12',
        },
        req,
      ),
    ).rejects.toMatchObject({ error: 'invalid_phone_token' });
    expect(repo.createUser).not.toHaveBeenCalled();
  });

  it('wrong OTP for signup is rejected', async () => {
    const { service } = makeService();
    await expect(
      service.verifyOtp(
        { phone: PHONE_NEW, code: '000000', purpose: 'signup' },
        req,
      ),
    ).rejects.toMatchObject({ error: 'invalid_code' });
  });

  it('OTP valid does not bypass uniqueness on concurrent username create (P2002)', async () => {
    const p2002 = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['username'] },
    });
    const { service, repo } = makeService({
      createUser: jest.fn().mockRejectedValue(p2002),
    });

    await expect(
      service.register(
        {
          phone: PHONE_NEW,
          phone_token: signupPhoneToken(PHONE_NEW),
          displayName: 'aaa',
          username: 'sarh',
          password: 'secret12',
        },
        req,
      ),
    ).rejects.toMatchObject({
      error: 'username_taken',
      messageAr: SIGNUP_USERNAME_TAKEN_AR,
    });
    expect(repo.createUser).toHaveBeenCalledTimes(1);
  });

  it('OTP valid does not bypass uniqueness on concurrent phone create (P2002)', async () => {
    const p2002 = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['phone'] },
    });
    const { service } = makeService({
      createUser: jest.fn().mockRejectedValue(p2002),
    });

    await expect(
      service.register(
        {
          phone: PHONE_NEW,
          phone_token: signupPhoneToken(PHONE_NEW),
          displayName: 'aaa',
          username: 'newuser',
          password: 'secret12',
        },
        req,
      ),
    ).rejects.toMatchObject({
      error: 'phone_taken',
      messageAr: SIGNUP_PHONE_TAKEN_AR,
    });
  });

  it('join purpose still issues token for existing phone (butcher flow untouched)', async () => {
    const { service } = makeService({
      findUserByPhone: jest.fn().mockResolvedValue({
        id: 'user-a',
        username: 'existing',
        phone: PHONE_A,
      }),
    });
    const result = await service.verifyOtp(
      { phone: PHONE_A, code: '123456', purpose: 'join' },
      req,
    );
    expect(result).toMatchObject({
      purpose: 'join',
      is_new_user: false,
      phone_token: expect.any(String),
    });
  });
});
