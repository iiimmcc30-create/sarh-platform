import { withExponentialBackoff, isRetryableHttpStatus } from './retry.util';

describe('retry.util', () => {
  it('does not retry 400/401/403/422', () => {
    expect(isRetryableHttpStatus(400)).toBe(false);
    expect(isRetryableHttpStatus(401)).toBe(false);
    expect(isRetryableHttpStatus(403)).toBe(false);
    expect(isRetryableHttpStatus(422)).toBe(false);
  });

  it('retries 408/429/500/502/503/504', () => {
    expect(isRetryableHttpStatus(500)).toBe(true);
    expect(isRetryableHttpStatus(502)).toBe(true);
    expect(isRetryableHttpStatus(429)).toBe(true);
  });

  it('retries until success on 500 then 200', async () => {
    let n = 0;
    const result = await withExponentialBackoff(
      async () => {
        n += 1;
        return { status: n === 1 ? 500 : 200, body: n };
      },
      { attempts: 3, baseDelayMs: 1, getStatus: (r) => r.status },
    );
    expect(result.status).toBe(200);
    expect(n).toBe(2);
  });

  it('does not retry 422', async () => {
    let n = 0;
    const result = await withExponentialBackoff(
      async () => {
        n += 1;
        return { status: 422 };
      },
      { attempts: 4, baseDelayMs: 1, getStatus: (r) => r.status },
    );
    expect(result.status).toBe(422);
    expect(n).toBe(1);
  });

  it('retries timeouts then throws', async () => {
    let n = 0;
    await expect(
      withExponentialBackoff(
        async () => {
          n += 1;
          const err = new Error('timeout');
          throw err;
        },
        { attempts: 3, baseDelayMs: 1, isTimeout: () => true },
      ),
    ).rejects.toThrow('timeout');
    expect(n).toBe(3);
  });
});
