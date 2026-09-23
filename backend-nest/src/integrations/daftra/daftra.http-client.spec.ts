import { DaftraClient } from './daftra.http-client';
import { DaftraRequestError } from './daftra.errors';

function jsonFetch(status: number, body: unknown) {
  return jest.fn(async () => ({
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe('DaftraClient HTTP mapping', () => {
  const secret = 'k'.repeat(24);

  it('maps 429 without leaking the API key', async () => {
    const client = new DaftraClient({
      origin: 'https://shop1.daftra.com',
      apiKey: secret,
      fetchImpl: jsonFetch(429, { result: 'failed', message: secret }),
    });
    await expect(client.get('/products.json')).rejects.toMatchObject({
      reason: 'RATE_LIMITED',
    });
    try {
      await client.get('/products.json');
    } catch (err) {
      expect(err).toBeInstanceOf(DaftraRequestError);
      expect(String(err)).not.toContain(secret);
    }
  });

  it('maps 404 to NOT_FOUND', async () => {
    const client = new DaftraClient({
      origin: 'https://shop1.daftra.com',
      apiKey: secret,
      fetchImpl: jsonFetch(404, { result: 'failed' }),
    });
    await expect(client.get('/products/9.json')).rejects.toMatchObject({
      reason: 'NOT_FOUND',
    });
  });

  it('sends Content-Type only when a JSON body is present', async () => {
    let getHeaders: Record<string, string> = {};
    let postHeaders: Record<string, string> = {};
    const fetchImpl = jest.fn(async (_url: string, init?: RequestInit) => {
      if (String(init?.method) === 'POST') {
        postHeaders = (init?.headers ?? {}) as Record<string, string>;
      } else {
        getHeaders = (init?.headers ?? {}) as Record<string, string>;
      }
      return {
        status: 200,
        json: async () => ({ result: 'success', data: {} }),
      };
    }) as unknown as typeof fetch;
    const client = new DaftraClient({
      origin: 'https://shop1.daftra.com',
      apiKey: secret,
      fetchImpl,
    });
    await client.get('/api_key_info.json');
    await client.post('/products.json', { Product: { name: 'x' } });
    expect(getHeaders['Content-Type']).toBeUndefined();
    expect(postHeaders['Content-Type']).toBe('application/json');
    expect(postHeaders.APIKEY).toBe(secret);
  });
});
