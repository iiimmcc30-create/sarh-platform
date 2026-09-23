import { encryptSecret } from '../../common/crypto/secret-encryption';
import { createDaftraClient } from './daftra.client';
import { DaftraRequestError } from './daftra.errors';
import { DaftraService } from './daftra.service';

jest.mock('./daftra.client', () => {
  const actual = jest.requireActual('./daftra.client') as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    createDaftraClient: jest.fn(),
  };
});

const mockedCreateClient = createDaftraClient as jest.MockedFunction<
  typeof createDaftraClient
>;

describe('DaftraService', () => {
  const prev = process.env.JWT_SECRET;
  const apiKeyA = 'butcher-a-secret-key-aaaa';
  const apiKeyB = 'butcher-b-secret-key-bbbb';

  beforeAll(() => {
    process.env.JWT_SECRET = 'x'.repeat(32);
  });

  afterAll(() => {
    process.env.JWT_SECRET = prev;
  });

  beforeEach(() => {
    mockedCreateClient.mockReset();
  });

  function encryptedRow(
    butcherId: string,
    apiKey: string,
    accountIdentifier: string,
  ) {
    const enc = encryptSecret(apiKey);
    return {
      butcherId,
      accountIdentifier,
      apiKeyCiphertext: enc.ciphertext,
      apiKeyIv: enc.iv,
      apiKeyTag: enc.tag,
      apiKeyLast4: apiKey.slice(-4),
      authMethod: 'API_KEY' as const,
      oauthProvider: null,
      accessTokenCiphertext: null,
      accessTokenIv: null,
      accessTokenTag: null,
      refreshTokenCiphertext: null,
      refreshTokenIv: null,
      refreshTokenTag: null,
      accessTokenExpiresAt: null,
      oauthScopes: null,
      oauthConnectedAt: null,
      status: 'CONNECTED' as const,
      lastConnectionTestAt: null,
      lastConnectionError: null,
      daftraLoginEmail: null,
      daftraLoginUrl: null,
    };
  }

  function setup(overrides: Record<string, unknown> = {}) {
    const prisma = {
      butcher: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'butcher-1',
          sourceApplicationId: 'app-1',
        }),
      },
      butcherDaftraIntegration: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      butcherDaftraProduct: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      butcherProduct: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return (arg as (tx: unknown) => Promise<unknown>)({});
        }
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }
        return arg;
      }),
    };
    const emailQueue = { addEmail: jest.fn() };
    const logger = { info: jest.fn(), warn: jest.fn() };
    Object.assign(prisma, overrides);
    const service = new DaftraService(
      prisma as never,
      emailQueue as never,
      logger as never,
    );
    return { service, prisma, emailQueue };
  }

  it('returns NOT_CONFIGURED when no row exists', async () => {
    const { service } = setup();
    const status = await service.getStatus('butcher-1');
    expect(status.status).toBe('NOT_CONFIGURED');
    expect(status.apiKeyMasked).toBeNull();
    expect(JSON.stringify(status)).not.toMatch(/apiKeyCiphertext|SUPER/);
  });

  it('rejects missing butcher (no IDOR create)', async () => {
    const { service, prisma } = setup();
    prisma.butcher.findUnique.mockResolvedValue(null);
    await expect(
      service.configure('admin-1', 'missing', {
        accountIdentifier: 'shop1',
        apiKey: '1234567890abcdef',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('loads Daftra credentials only for the requested butcherId', async () => {
    const { service, prisma } = setup();
    prisma.butcher.findUnique.mockResolvedValue({ id: 'butcher-b' });
    prisma.butcherDaftraIntegration.findUnique.mockImplementation(
      (args: { where: { butcherId: string } }) => {
        expect(args.where).toEqual({ butcherId: 'butcher-b' });
        return null;
      },
    );
    await expect(service.listProducts('butcher-b')).rejects.toMatchObject({
      error: 'not_configured',
    });
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it('never builds a Daftra client with another butcher’s decrypted key', async () => {
    const { service, prisma } = setup();
    const rowA = encryptedRow('butcher-a', apiKeyA, 'shop-a');
    const rowB = encryptedRow('butcher-b', apiKeyB, 'shop-b');
    prisma.butcher.findUnique.mockResolvedValue({ id: 'butcher-a' });
    prisma.butcherDaftraIntegration.findUnique.mockImplementation(
      (args: { where: { butcherId: string } }) => {
        if (args.where.butcherId === 'butcher-a') return rowA;
        if (args.where.butcherId === 'butcher-b') return rowB;
        return null;
      },
    );
    mockedCreateClient.mockReturnValue({
      get: jest.fn().mockResolvedValue({
        httpStatus: 200,
        body: {
          data: [],
          pagination: { page: 1, page_count: 1, total_results: 0 },
        },
      }),
    } as never);

    await service.listProducts('butcher-a');

    expect(mockedCreateClient).toHaveBeenCalledTimes(1);
    expect(mockedCreateClient).toHaveBeenCalledWith({
      accountIdentifier: 'shop-a',
      apiKey: apiKeyA,
    });
    expect(JSON.stringify(mockedCreateClient.mock.calls)).not.toContain(
      apiKeyB,
    );
  });

  it('maps empty product pages through the service', async () => {
    const { service, prisma } = setup();
    prisma.butcherDaftraIntegration.findUnique.mockResolvedValue(
      encryptedRow('butcher-1', apiKeyA, 'shop-a'),
    );
    mockedCreateClient.mockReturnValue({
      get: jest.fn().mockResolvedValue({
        httpStatus: 200,
        body: {
          result: 'success',
          data: [],
          pagination: { page: 1, page_count: 1, total_results: 0 },
        },
      }),
    } as never);
    const page = await service.listProducts('butcher-1');
    expect(page.items).toEqual([]);
    expect(page.totalResults).toBe(0);
  });

  it('maps Daftra product API errors to a safe internal error', async () => {
    const { service, prisma } = setup();
    prisma.butcherDaftraIntegration.findUnique.mockResolvedValue(
      encryptedRow('butcher-1', apiKeyA, 'shop-a'),
    );
    mockedCreateClient.mockReturnValue({
      get: jest
        .fn()
        .mockRejectedValue(
          new DaftraRequestError(
            'UPSTREAM_ERROR',
            'خدمة دفترة غير متاحة حالياً',
            500,
          ),
        ),
    } as never);
    await expect(service.listProducts('butcher-1')).rejects.toMatchObject({
      error: 'upstream_error',
    });
  });

  it('refuses to link a Sarh product that belongs to another butcher', async () => {
    const { service, prisma } = setup();
    prisma.butcher.findUnique.mockResolvedValue({ id: 'butcher-a' });
    prisma.butcherDaftraIntegration.findUnique.mockResolvedValue(
      encryptedRow('butcher-a', apiKeyA, 'shop-a'),
    );
    mockedCreateClient.mockReturnValue({
      get: jest.fn().mockResolvedValue({
        httpStatus: 200,
        body: {
          data: {
            Product: { id: 9, name: 'لحم', product_code: 'SKU-1' },
          },
        },
      }),
    } as never);
    prisma.butcherProduct.findFirst.mockResolvedValue(null);

    await expect(
      service.linkProduct('butcher-a', {
        daftraProductId: 9,
        sarhProductId: 'product-from-b',
      }),
    ).rejects.toMatchObject({ error: 'product_not_found' });
    expect(prisma.butcherProduct.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'product-from-b',
          butcherId: 'butcher-a',
        }),
      }),
    );
  });

  it('returns a decrypt error without exposing ciphertext', async () => {
    const { service, prisma } = setup();
    prisma.butcherDaftraIntegration.findUnique.mockResolvedValue({
      ...encryptedRow('butcher-1', apiKeyA, 'shop-a'),
      apiKeyTag: 'AAAA',
    });
    await expect(service.listProducts('butcher-1')).rejects.toMatchObject({
      error: 'decrypt_failed',
    });
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });

  it('status payload never includes the raw API key', async () => {
    const { service, prisma } = setup();
    prisma.butcherDaftraIntegration.findUnique.mockResolvedValue(
      encryptedRow('butcher-1', apiKeyA, 'shop-a'),
    );
    const status = await service.getStatus('butcher-1');
    const json = JSON.stringify(status);
    expect(json).not.toContain(apiKeyA);
    expect(json).not.toContain('apiKeyCiphertext');
    expect(status.apiKeyMasked).toMatch(/••••/);
  });

  it('resolves the butcher shop from the authenticated user id', async () => {
    const { service, prisma } = setup();
    prisma.butcher.findUnique.mockImplementation(
      (args: { where: { userId?: string; id?: string } }) => {
        expect(args.where).toEqual({ userId: 'user-a' });
        return { id: 'butcher-a' };
      },
    );
    await expect(
      service.requireOwnedButcherId({
        userId: 'user-a',
        username: 'a',
        role: 'BUTCHER',
        passwordVersion: 1,
      }),
    ).resolves.toBe('butcher-a');
  });

  it('syncs Daftra products into Sarh without creating duplicates on second run', async () => {
    const { service, prisma } = setup();
    const row = encryptedRow('butcher-1', apiKeyA, 'shop-a');
    prisma.butcher.findUnique.mockResolvedValue({
      id: 'butcher-1',
      country: 'SA',
      sourceApplicationId: null,
    });
    prisma.butcherDaftraIntegration.findUnique.mockResolvedValue(row);

    const remoteProduct = {
      id: 42,
      name: 'لحم تجريبي',
      product_code: 'SARH-TEST-1',
      unit_price: 55,
      stock_balance: 3,
      track_stock: 1,
    };

    mockedCreateClient.mockReturnValue({
      get: jest.fn().mockResolvedValue({
        httpStatus: 200,
        body: {
          result: 'successful',
          data: [{ Product: remoteProduct }],
          pagination: { page: 1, page_count: 1, total_results: 1 },
        },
      }),
    } as never);

    prisma.butcherProduct.create.mockResolvedValue({ id: 'sarh-p-1' });
    prisma.butcherDaftraProduct.upsert.mockResolvedValue({
      id: 'link-1',
      butcherId: 'butcher-1',
      daftraProductId: 42,
      sarhProductId: 'sarh-p-1',
    });

    const first = await service.syncProductsFromDaftra('admin-1', 'butcher-1');
    expect(first).toMatchObject({
      fetched: 1,
      created: 1,
      updated: 0,
      skipped: 0,
      pages: 1,
    });
    expect(prisma.butcherProduct.create).toHaveBeenCalledTimes(1);
    expect(prisma.butcherDaftraProduct.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          butcherId_daftraProductId: {
            butcherId: 'butcher-1',
            daftraProductId: 42,
          },
        },
      }),
    );

    prisma.butcherDaftraProduct.findUnique.mockResolvedValue({
      id: 'link-1',
      butcherId: 'butcher-1',
      daftraProductId: 42,
      sarhProductId: 'sarh-p-1',
    });
    prisma.butcherProduct.findFirst.mockResolvedValue({ id: 'sarh-p-1' });
    prisma.butcherProduct.update.mockResolvedValue({ id: 'sarh-p-1' });
    prisma.butcherDaftraProduct.update.mockResolvedValue({ id: 'link-1' });

    const second = await service.syncProductsFromDaftra('admin-1', 'butcher-1');
    expect(second).toMatchObject({
      fetched: 1,
      created: 0,
      updated: 1,
      skipped: 0,
    });
    expect(prisma.butcherProduct.create).toHaveBeenCalledTimes(1);
    expect(prisma.butcherProduct.update).toHaveBeenCalledTimes(1);
  });

  it('never auto-deletes Sarh products during sync when Daftra list is empty', async () => {
    const { service, prisma } = setup();
    prisma.butcher.findUnique.mockResolvedValue({
      id: 'butcher-1',
      country: 'SA',
      sourceApplicationId: null,
    });
    prisma.butcherDaftraIntegration.findUnique.mockResolvedValue(
      encryptedRow('butcher-1', apiKeyA, 'shop-a'),
    );
    mockedCreateClient.mockReturnValue({
      get: jest.fn().mockResolvedValue({
        httpStatus: 200,
        body: {
          result: 'successful',
          data: [],
          pagination: { page: 1, page_count: 1, total_results: 0 },
        },
      }),
    } as never);

    const result = await service.syncProductsFromDaftra('admin-1', 'butcher-1');
    expect(result.fetched).toBe(0);
    expect(prisma.butcherProduct.create).not.toHaveBeenCalled();
    expect(
      (prisma.butcherProduct as { deleteMany?: unknown }).deleteMany,
    ).toBeUndefined();
  });

  it('lists only CONNECTED butcher ids for the product poll', async () => {
    const { service, prisma } = setup();
    prisma.butcherDaftraIntegration.findMany.mockResolvedValue([
      { butcherId: 'butcher-connected' },
    ]);
    const ids = await service.listConnectedButcherIds();
    expect(ids).toEqual(['butcher-connected']);
    expect(prisma.butcherDaftraIntegration.findMany).toHaveBeenCalledWith({
      take: 500,
      where: { status: 'CONNECTED' },
      select: { butcherId: true },
    });
  });
});
