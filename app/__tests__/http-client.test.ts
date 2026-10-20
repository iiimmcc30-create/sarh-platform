import { isOfflineSnapshot } from '@/lib/connectivity';
import { planImageResize, UPLOAD_IMAGE_MAX_EDGE } from '@/lib/prepareUploadImage';
import {
  isListOrFeedGet,
  isUploadRequest,
  resolveTimeoutMs,
  retryDelayMs,
  shouldRetryStatus,
  LIST_GET_TIMEOUT_MS,
  UPLOAD_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
} from '@/services/httpPolicy';
import { fetchWithTimeout } from '@/services/fetchWithTimeout';

jest.mock('@/services/apiFallback', () => ({
  resolveRequestUrl: async (input: string) => input,
}));

describe('http policy', () => {
  it('treats collection GETs as fast list reads and leaves detail GETs alone', () => {
    expect(isListOrFeedGet('https://getsarh.com/api/listings?page=2', 'GET')).toBe(true);
    expect(isListOrFeedGet('https://getsarh.com/api/listings/abc', 'GET')).toBe(false);
    expect(isListOrFeedGet('https://getsarh.com/api/posts', 'GET')).toBe(true);
    expect(isListOrFeedGet('https://getsarh.com/api/listings', 'POST')).toBe(false);
  });

  it('uses short list timeouts, long upload timeouts, and honors an explicit deadline', () => {
    expect(resolveTimeoutMs('https://getsarh.com/api/home', 'GET')).toBe(LIST_GET_TIMEOUT_MS);
    expect(resolveTimeoutMs('https://getsarh.com/api/listings/abc', 'GET')).toBe(DEFAULT_TIMEOUT_MS);
    expect(resolveTimeoutMs('https://cdn.example/upload', 'PUT')).toBe(UPLOAD_TIMEOUT_MS);
    expect(isUploadRequest('https://cdn.example/upload', 'PUT')).toBe(true);
    expect(resolveTimeoutMs('https://getsarh.com/api/listings', 'GET', 4_000)).toBe(4_000);
  });

  it('retries transient read failures and not 429 or mutations', () => {
    expect(shouldRetryStatus('GET', 503)).toBe(true);
    expect(shouldRetryStatus('GET', 429)).toBe(false);
    expect(shouldRetryStatus('POST', 503)).toBe(false);
  });

  it('backs off with jitter and a cap', () => {
    expect(retryDelayMs(0, 0)).toBe(150);
    expect(retryDelayMs(0, 1)).toBe(300);
    expect(retryDelayMs(8, 0)).toBe(1_250);
  });
});

describe('fetchWithTimeout', () => {
  const fast = globalThis as { __SARH_HTTP_FAST_RETRY__?: boolean };

  beforeEach(() => {
    fast.__SARH_HTTP_FAST_RETRY__ = true;
  });

  afterEach(() => {
    delete fast.__SARH_HTTP_FAST_RETRY__;
    jest.restoreAllMocks();
  });

  it('retries a list GET on 503 then returns the success', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response('no', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
    const res = await fetchWithTimeout('https://getsarh.com/api/listings');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a POST or a 429', async () => {
    const fetchMock = jest.fn(async () => new Response('no', { status: 503 }));
    global.fetch = fetchMock as typeof fetch;
    const post = await fetchWithTimeout('https://getsarh.com/api/listings', { method: 'POST' });
    expect(post.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(new Response('slow', { status: 429 }));
    const limited = await fetchWithTimeout('https://getsarh.com/api/listings');
    expect(limited.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not repeat a caller abort', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = jest.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });
    global.fetch = fetchMock as typeof fetch;
    await expect(
      fetchWithTimeout('https://getsarh.com/api/listings', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces TimeoutError and retries an idempotent GET', async () => {
    let calls = 0;
    global.fetch = jest.fn((_url: string, init?: RequestInit) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        const fail = () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        };
        if (init?.signal?.aborted) fail();
        else init?.signal?.addEventListener('abort', fail, { once: true });
      });
    }) as typeof fetch;

    await expect(
      fetchWithTimeout('https://getsarh.com/api/listings/abc', {}, 20),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(calls).toBe(2);
  });
});

describe('upload resize plan', () => {
  it('downscales the long edge and never upscales', () => {
    expect(planImageResize(800, 600)).toBeNull();
    expect(planImageResize(undefined, 4000)).toBeNull();
    expect(planImageResize(3200, 1800)).toEqual({ width: UPLOAD_IMAGE_MAX_EDGE });
    expect(planImageResize(1800, 3200)).toEqual({ height: UPLOAD_IMAGE_MAX_EDGE });
  });
});

describe('connectivity snapshot', () => {
  it('is offline only when the radio or reachability says so', () => {
    expect(isOfflineSnapshot({ isConnected: null, isInternetReachable: null })).toBe(false);
    expect(isOfflineSnapshot({ isConnected: true, isInternetReachable: true })).toBe(false);
    expect(isOfflineSnapshot({ isConnected: false, isInternetReachable: null })).toBe(true);
    expect(isOfflineSnapshot({ isConnected: true, isInternetReachable: false })).toBe(true);
  });
});
