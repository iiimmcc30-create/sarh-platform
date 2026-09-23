import {
  assertDaftraOAuthClientConfigured,
  daftraOAuthTokenUrl,
  DAFTRA_OAUTH_REDIRECT_URI_DEFAULT,
  readDaftraOAuthEnv,
} from './daftra.oauth.config';
import {
  clearOAuthStateMemoryForTests,
  consumeOAuthState,
  generateOAuthState,
  saveOAuthState,
} from './daftra.oauth.state';
import {
  exchangeDaftraPasswordGrant,
  refreshDaftraAccessToken,
} from './daftra.oauth.token';
import { encryptSecret } from '../../common/crypto/secret-encryption';
import { DaftraService } from './daftra.service';
import { DaftraClient } from './daftra.http-client';
import { createDaftraOAuthClient } from './daftra.client';
import { ApiException } from '../../common/exceptions/api.exception';

describe('Daftra OAuth config + documented password grant', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
    clearOAuthStateMemoryForTests();
  });

  it('reads redirect URI from ENV exactly', () => {
    process.env.DAFTRA_CLIENT_ID = 'cid';
    process.env.DAFTRA_CLIENT_SECRET = 'csecret';
    process.env.DAFTRA_OAUTH_REDIRECT_URI =
      'https://sarhsa.online/api/butchers/daftra/oauth/callback';
    const cfg = assertDaftraOAuthClientConfigured();
    expect(cfg.redirectUri).toBe(DAFTRA_OAUTH_REDIRECT_URI_DEFAULT);
  });

  it('builds documented token URL under /api2/oauth/token', () => {
    expect(daftraOAuthTokenUrl('https://sarh-app.daftra.com')).toBe(
      'https://sarh-app.daftra.com/api2/oauth/token',
    );
  });

  it('rejects insecure redirect URI', () => {
    process.env.DAFTRA_CLIENT_ID = 'cid';
    process.env.DAFTRA_CLIENT_SECRET = 'sec';
    process.env.DAFTRA_OAUTH_REDIRECT_URI = 'http://evil.example/cb';
    expect(() =>
      assertDaftraOAuthClientConfigured(readDaftraOAuthEnv()),
    ).toThrow(/redirect_insecure/);
  });

  it('exchanges password grant without logging secrets', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        access_token: 'ACCESS_SECRET_TOKEN',
        refresh_token: 'REFRESH_SECRET_TOKEN',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    });
    const tokens = await exchangeDaftraPasswordGrant({
      origin: 'https://sarh-app.daftra.com',
      clientId: 'cid',
      clientSecret: 'csecret',
      username: 'user@example.com',
      password: 'hunter2',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(tokens.accessToken).toBe('ACCESS_SECRET_TOKEN');
    const body = String(fetchImpl.mock.calls[0][1].body);
    expect(body).toContain('grant_type=password');
    expect(body).toContain('username=user%40example.com');
    expect(JSON.stringify(tokens)).not.toContain('csecret');
  });

  it('maps password grant failure safely', async () => {
    await expect(
      exchangeDaftraPasswordGrant({
        origin: 'https://sarh-app.daftra.com',
        clientId: 'cid',
        clientSecret: 'csecret',
        username: 'x',
        password: 'y',
        fetchImpl: jest.fn().mockResolvedValue({
          status: 401,
          json: async () => ({
            error: 'invalid_credentials',
            message: 'The user credentials were incorrect.',
          }),
        }) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_API_KEY' });
  });

  it('refreshes access token with refresh_token grant', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        access_token: 'NEW_ACCESS',
        refresh_token: 'NEW_REFRESH',
        token_type: 'Bearer',
        expires_in: 1800,
      }),
    });
    const tokens = await refreshDaftraAccessToken({
      origin: 'https://sarh-app.daftra.com',
      clientId: 'cid',
      clientSecret: 'csecret',
      refreshToken: 'OLD_REFRESH',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(tokens.accessToken).toBe('NEW_ACCESS');
    expect(String(fetchImpl.mock.calls[0][1].body)).toContain(
      'grant_type=refresh_token',
    );
  });

  it('state helpers still one-time consume', async () => {
    const state = generateOAuthState();
    await saveOAuthState(state, {
      userId: 'u1',
      butcherId: 'b1',
      accountIdentifier: 'sarh-app',
      createdAt: Date.now(),
    });
    expect((await consumeOAuthState(state))?.butcherId).toBe('b1');
    expect(await consumeOAuthState(state)).toBeNull();
  });
});

describe('DaftraClient OAuth bearer + 401 refresh retry', () => {
  it('sends Authorization Bearer and retries once after refresh', async () => {
    const calls: Array<{ auth?: string; apiKey?: string }> = [];
    let access = 'tok-1';
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      calls.push({ auth: headers.Authorization, apiKey: headers.APIKEY });
      if (access === 'tok-1') {
        return {
          status: 401,
          json: async () => ({ result: 'failed', code: 401 }),
        };
      }
      return {
        status: 200,
        json: async () => ({ result: 'success', data: { id: 1 } }),
      };
    });

    const client = new DaftraClient({
      origin: 'https://shop1.daftra.com',
      accessToken: access,
      refreshAccessToken: async () => {
        access = 'tok-2';
        return access;
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const res = await client.get('/products.json');
    expect(res.httpStatus).toBe(200);
    expect(calls[0].auth).toBe('Bearer tok-1');
    expect(calls[0].apiKey).toBeUndefined();
    expect(calls[1].auth).toBe('Bearer tok-2');
  });

  it('fails when refresh returns null after 401', async () => {
    const client = createDaftraOAuthClient(
      {
        accountIdentifier: 'shop1',
        accessToken: 'dead',
        refreshAccessToken: async () => null,
      },
      jest.fn().mockResolvedValue({
        status: 401,
        json: async () => ({ result: 'failed', code: 401 }),
      }) as unknown as typeof fetch,
    );
    await expect(client.get('/products.json')).rejects.toMatchObject({
      reason: 'INVALID_API_KEY',
    });
  });
});

describe('DaftraService OAuth routes (authorization_code unsupported)', () => {
  const prevJwt = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'x'.repeat(32);
    process.env.DAFTRA_CLIENT_ID = 'cid';
    process.env.DAFTRA_CLIENT_SECRET = 'csecret-value';
    process.env.DAFTRA_OAUTH_REDIRECT_URI =
      'https://sarhsa.online/api/butchers/daftra/oauth/callback';
    process.env.APP_URL = 'https://sarhsa.online';
  });

  afterAll(() => {
    process.env.JWT_SECRET = prevJwt;
  });

  function setup(row: Record<string, unknown> | null = null) {
    const prisma = {
      butcher: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'butcher-1',
          sourceApplicationId: null,
        }),
      },
      butcherDaftraIntegration: {
        findUnique: jest.fn().mockResolvedValue(row),
        upsert: jest.fn().mockImplementation(async ({ create, update }) => ({
          ...(row ?? {}),
          ...create,
          ...update,
          butcherId: 'butcher-1',
        })),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          ...(row ?? {}),
          ...data,
          butcherId: 'butcher-1',
        })),
      },
      butcherDaftraProduct: { findMany: jest.fn(), upsert: jest.fn() },
      butcherProduct: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({}),
      ),
    };
    const emailQueue = { addEmail: jest.fn() };
    const logger = { info: jest.fn(), warn: jest.fn() };
    const service = new DaftraService(
      prisma as never,
      emailQueue as never,
      logger as never,
    );
    return { service, prisma, logger };
  }

  const user = { userId: 'user-1', role: 'USER' } as never;

  it('oauth/start rejects undocumented authorization_code flow', async () => {
    const { service } = setup(null);
    await expect(
      service.startOAuthForOwner(user, 'sarh-app'),
    ).rejects.toBeInstanceOf(ApiException);
    try {
      await service.startOAuthForOwner(user, 'sarh-app');
    } catch (err) {
      expect(err).toMatchObject({
        status: 501,
        error: 'oauth_authorization_code_unsupported',
      });
    }
  });

  it('oauth/callback redirects with unsupported reason and never stores tokens', async () => {
    const { service, prisma } = setup(null);
    const result = await service.handleOAuthCallback({
      code: 'any',
      state: 'any',
    });
    expect(result.redirectUrl).toContain(
      'oauth_authorization_code_unsupported',
    );
    expect(prisma.butcherDaftraIntegration.upsert).not.toHaveBeenCalled();
  });

  it('password grant connect stores encrypted tokens and probes API', async () => {
    const { service, prisma, logger } = setup(null);
    let stored: Record<string, unknown> | null = null;
    prisma.butcherDaftraIntegration.upsert.mockImplementation(
      async ({ create }) => {
        stored = { ...create, butcherId: 'butcher-1' };
        return stored;
      },
    );
    prisma.butcherDaftraIntegration.findUnique.mockImplementation(
      async () => stored,
    );

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url) => {
        const href = String(url);
        if (href.includes('/oauth/token')) {
          return {
            status: 200,
            json: async () => ({
              access_token: 'ACCESS_PLAIN',
              refresh_token: 'REFRESH_PLAIN',
              token_type: 'Bearer',
              expires_in: 3600,
            }),
          } as Response;
        }
        return {
          status: 200,
          json: async () => ({
            result: 'success',
            code: 200,
            data: { id: 1, name: 'k', key: 'x' },
          }),
        } as Response;
      });

    const status = await service.connectPasswordGrantForOwner(user, {
      accountIdentifier: 'sarh-app',
      username: 'demo@example.com',
      password: 'secret-pass',
    });
    expect(status.connected).toBe(true);
    const cipher =
      stored && typeof stored === 'object'
        ? String(
            (stored as Record<string, unknown>).accessTokenCiphertext ?? '',
          )
        : '';
    expect(cipher).toBeTruthy();
    expect(cipher).not.toBe('ACCESS_PLAIN');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(
      'ACCESS_PLAIN',
    );
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('secret-pass');
    fetchSpy.mockRestore();
  });

  it('disconnect clears OAuth tokens and keeps API key fields', async () => {
    const enc = encryptSecret('api-key-keep-me-please');
    const access = encryptSecret('access-token-value');
    const refresh = encryptSecret('refresh-token-value');
    const row = {
      butcherId: 'butcher-1',
      accountIdentifier: 'sarh-app',
      apiKeyCiphertext: enc.ciphertext,
      apiKeyIv: enc.iv,
      apiKeyTag: enc.tag,
      apiKeyLast4: 'ease',
      authMethod: 'BOTH',
      oauthProvider: 'daftra',
      accessTokenCiphertext: access.ciphertext,
      accessTokenIv: access.iv,
      accessTokenTag: access.tag,
      refreshTokenCiphertext: refresh.ciphertext,
      refreshTokenIv: refresh.iv,
      refreshTokenTag: refresh.tag,
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      oauthScopes: null,
      oauthConnectedAt: new Date(),
      status: 'CONNECTED',
      lastConnectionTestAt: null,
      lastConnectionError: null,
      daftraLoginEmail: null,
      daftraLoginUrl: null,
    };
    const { service, prisma } = setup(row);
    prisma.butcherDaftraIntegration.findUnique
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({
        ...row,
        accessTokenCiphertext: null,
        accessTokenIv: null,
        accessTokenTag: null,
        refreshTokenCiphertext: null,
        oauthProvider: null,
        authMethod: 'API_KEY',
      });
    const status = await service.disconnectOAuthForOwner(user);
    expect(status.connected).toBe(false);
    const update = prisma.butcherDaftraIntegration.update.mock.calls[0][0].data;
    expect(update.accessTokenCiphertext).toBeNull();
  });
});
