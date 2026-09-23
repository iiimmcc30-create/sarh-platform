import { DaftraClient } from './daftra.http-client';
import { DaftraRequestError } from './daftra.errors';
import {
  assertValidDaftraAccountIdentifier,
  daftraApiKeyInfoUrl,
  resolveDaftraOrigin,
  testDaftraConnection,
} from './daftra.client';

function jsonFetch(
  status: number,
  body: unknown,
  inspect?: (init: RequestInit) => void,
) {
  return jest.fn(async (_url: string, init?: RequestInit) => {
    inspect?.(init ?? {});
    return {
      status,
      json: async () => body,
    };
  }) as unknown as typeof fetch;
}

describe('daftra.client + DaftraClient', () => {
  it('builds api2 key-info URL from account identifier', () => {
    expect(daftraApiKeyInfoUrl('AcmeShop')).toBe(
      'https://acmeshop.daftra.com/api2/api_key_info.json',
    );
  });

  it('rejects unsafe account identifiers', () => {
    expect(() =>
      assertValidDaftraAccountIdentifier('https://evil.example/x'),
    ).toThrow();
    expect(() => assertValidDaftraAccountIdentifier('a b')).toThrow();
  });

  it('uses DAFTRA_API_BASE_URL only when the tenant placeholder is present', () => {
    const prev = process.env.DAFTRA_API_BASE_URL;
    process.env.DAFTRA_API_BASE_URL = 'https://{account}.example.test';
    expect(resolveDaftraOrigin('Shop-A')).toBe('https://shop-a.example.test');
    process.env.DAFTRA_API_BASE_URL = 'https://shared.example.test';
    expect(resolveDaftraOrigin('shop-a')).toBe('https://shop-a.daftra.com');
    process.env.DAFTRA_API_BASE_URL = prev;
  });

  it('connects with a valid API key and never sends Authorization', async () => {
    let headers: Record<string, string> = {};
    let method = '';
    const fetchImpl = jsonFetch(
      200,
      { result: 'success', code: 200, data: { key: 'SUPER_SECRET_KEY' } },
      (init) => {
        headers = init.headers as Record<string, string>;
        method = String(init.method ?? 'GET');
      },
    );
    const result = await testDaftraConnection(
      { accountIdentifier: 'shop1', apiKey: 'SUPER_SECRET_KEY' },
      fetchImpl,
    );
    expect(result).toEqual({
      connected: true,
      httpStatus: 200,
      host: 'shop1.daftra.com',
      path: '/api_key_info.json',
    });
    expect(method).toBe('GET');
    expect(headers.APIKEY).toBe('SUPER_SECRET_KEY');
    expect(headers.Authorization).toBeUndefined();
    expect(headers['Content-Type']).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('SUPER_SECRET');
  });

  it('treats a missing API key as INVALID_API_KEY without calling fetch', async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const result = await testDaftraConnection(
      { accountIdentifier: 'shop1', apiKey: '   ' },
      fetchImpl,
    );
    expect(result.connected).toBe(false);
    if (!result.connected) expect(result.reason).toBe('INVALID_API_KEY');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepts Success result casing from Daftra', async () => {
    const result = await testDaftraConnection(
      { accountIdentifier: 'shop1', apiKey: 'SUPER_SECRET_KEY' },
      jsonFetch(200, { result: 'Success', code: 200, data: { id: 1 } }),
    );
    expect(result.connected).toBe(true);
  });

  it('accepts result=successful from products-style Daftra responses', async () => {
    const client = new DaftraClient({
      origin: 'https://shop1.daftra.com',
      apiKey: 'SUPER_SECRET_KEY',
      fetchImpl: jsonFetch(200, {
        result: 'successful',
        code: 200,
        data: [],
        pagination: {},
      }),
    });
    const res = await client.get('/products.json', { page: 1, limit: 1 });
    expect(res.httpStatus).toBe(200);
  });

  it('falls back to products.json when api_key_info returns 404', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      if (String(url).includes('api_key_info')) {
        return {
          status: 404,
          json: async () => ({
            result: 'failed',
            code: 404,
            message: 'Invalid Endpoint',
          }),
        };
      }
      return {
        status: 200,
        json: async () => ({
          result: 'successful',
          code: 200,
          data: [],
        }),
      };
    }) as unknown as typeof fetch;

    const result = await testDaftraConnection(
      { accountIdentifier: 'malhmah', apiKey: 'SUPER_SECRET_KEY' },
      fetchImpl,
    );
    expect(result.connected).toBe(true);
    if (result.connected) {
      expect(result.path).toBe('/products.json');
      expect(result.host).toBe('malhmah.daftra.com');
    }
  });

  it('preserves INVALID_API_KEY with httpStatus for diagnostics', async () => {
    const result = await testDaftraConnection(
      { accountIdentifier: 'shop1', apiKey: 'SUPER_SECRET_KEY' },
      jsonFetch(401, { result: 'failed', message: 'bad key ABCDEF' }),
    );
    expect(result.connected).toBe(false);
    if (!result.connected) {
      expect(result.reason).toBe('INVALID_API_KEY');
      expect(result.httpStatus).toBe(401);
      expect(result.host).toBe('shop1.daftra.com');
      expect(result.safeReason).not.toContain('SUPER_SECRET');
      expect(result.safeReason).not.toContain('ABCDEF');
    }
  });

  it('preserves NOT_FOUND instead of collapsing to CONNECTION_FAILED', async () => {
    const result = await testDaftraConnection(
      { accountIdentifier: 'shop1', apiKey: 'SUPER_SECRET_KEY' },
      jsonFetch(404, { result: 'failed', message: 'missing' }),
    );
    expect(result.connected).toBe(false);
    if (!result.connected) {
      expect(result.reason).toBe('NOT_FOUND');
      expect(result.httpStatus).toBe(404);
    }
  });

  it('builds the documented api_key_info URL for sarh-app subdomain', () => {
    expect(daftraApiKeyInfoUrl('sarh-app')).toBe(
      'https://sarh-app.daftra.com/api2/api_key_info.json',
    );
    expect(resolveDaftraOrigin('sarh-app')).toBe('https://sarh-app.daftra.com');
    // Account ID is NOT the API hostname — subdomain is.
    expect(resolveDaftraOrigin('5016244')).toBe('https://5016244.daftra.com');
  });

  it('daftraConnectionLogFields never includes secrets', async () => {
    const { daftraConnectionLogFields } = await import('./daftra.client');
    const failed = await testDaftraConnection(
      { accountIdentifier: 'shop1', apiKey: 'SUPER_SECRET_KEY' },
      jsonFetch(401, { result: 'failed', code: 401, message: 'Unauthorized' }),
    );
    const fields = daftraConnectionLogFields(failed);
    expect(fields).toMatchObject({
      connected: false,
      reason: 'INVALID_API_KEY',
      httpStatus: 401,
      host: 'shop1.daftra.com',
    });
    expect(JSON.stringify(fields)).not.toContain('SUPER_SECRET');
  });

  it('maps timeout to CONNECTION_FAILED', async () => {
    const fetchImpl = jest.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    }) as unknown as typeof fetch;
    const result = await testDaftraConnection(
      { accountIdentifier: 'shop1', apiKey: 'SUPER_SECRET_KEY' },
      fetchImpl,
    );
    expect(result.connected).toBe(false);
    if (!result.connected) expect(result.reason).toBe('CONNECTION_FAILED');
  });

  it('maps network failure to CONNECTION_FAILED', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const result = await testDaftraConnection(
      { accountIdentifier: 'shop1', apiKey: 'x'.repeat(20) },
      fetchImpl,
    );
    expect(result.connected).toBe(false);
    if (!result.connected) expect(result.reason).toBe('CONNECTION_FAILED');
  });

  it('paginates products and normalizes empty lists', async () => {
    const client = new DaftraClient({
      origin: 'https://shop1.daftra.com',
      apiKey: 'k'.repeat(20),
      fetchImpl: jsonFetch(200, {
        result: 'success',
        data: [],
        pagination: { page: 1, page_count: 1, total_results: 0 },
      }),
    });
    const res = await client.get('/products.json', { page: 1, limit: 20 });
    expect(res.body).toMatchObject({ data: [] });
  });

  it('throws a safe error on Daftra product API failure', async () => {
    const client = new DaftraClient({
      origin: 'https://shop1.daftra.com',
      apiKey: 'k'.repeat(20),
      fetchImpl: jsonFetch(500, {
        result: 'failed',
        message: 'key leaked-secret',
      }),
    });
    await expect(client.get('/products.json')).rejects.toBeInstanceOf(
      DaftraRequestError,
    );
    try {
      await client.get('/products.json');
    } catch (err) {
      expect(String(err)).not.toContain('leaked-secret');
      expect(String(err)).not.toContain('k'.repeat(20));
    }
  });
});
