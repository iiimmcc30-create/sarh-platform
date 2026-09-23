import {
  createRequestGeneration,
  dedupeGetResponse,
  dedupeInflight,
  feedRetryDelayMs,
  noteRateLimitFromResponse,
  parseRetryAfterMs,
  resetRequestCoordination,
  isRateLimited,
  msUntilRateLimitClears,
  shouldReuseFreshResult,
} from '../services/requestCoordination';
import { FEED_TIMEOUT_MS, fetchPublicFeed } from '../services/fetchPublicFeed';
import { resetHomeExploreCache, fetchHomeExploreSections } from '../services/homeExplore';
import { resetEditorialStoriesCache, fetchEditorialStories } from '../services/editorialStories';

jest.mock('../services/api', () => ({
  API_BASE: 'https://example.test',
}));

const fetchWithTimeout = jest.fn();
jest.mock('../services/fetchWithTimeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeout(...args),
}));

function jsonResponse(body: unknown, status = 200): Response {
  const text = JSON.stringify(body);
  const buffer = new TextEncoder().encode(text).buffer;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {
      get: (key: string) => (key.toLowerCase() === 'retry-after' && status === 429 ? '90' : null),
    },
    json: async () => body,
    text: async () => text,
    arrayBuffer: async () => buffer.slice(0),
    clone() {
      return jsonResponse(body, status);
    },
  } as unknown as Response;
}

describe('request storm coordination', () => {
  beforeEach(() => {
    resetRequestCoordination();
    resetHomeExploreCache();
    resetEditorialStoriesCache();
    fetchWithTimeout.mockReset();
    global.fetch = jest.fn();
  });

  it('dedupes concurrent identical in-flight work', async () => {
    let runs = 0;
    const tasks = await Promise.all([
      dedupeInflight('k', async () => {
        runs += 1;
        await new Promise((r) => setTimeout(r, 20));
        return 'ok';
      }),
      dedupeInflight('k', async () => {
        runs += 1;
        return 'nope';
      }),
      dedupeInflight('k', async () => {
        runs += 1;
        return 'nope';
      }),
    ]);
    expect(runs).toBe(1);
    expect(tasks).toEqual(['ok', 'ok', 'ok']);
  });

  it('dedupeGetResponse lets every waiter read JSON', async () => {
    let calls = 0;
    const [a, b] = await Promise.all([
      dedupeGetResponse('g', async () => {
        calls += 1;
        return jsonResponse({ ok: true });
      }),
      dedupeGetResponse('g', async () => {
        calls += 1;
        return jsonResponse({ ok: false });
      }),
    ]);
    expect(calls).toBe(1);
    expect(await a.json()).toEqual({ ok: true });
    expect(await b.json()).toEqual({ ok: true });
  });

  it('dedupeGetResponse preserves Arabic UTF-8 (no ArrayBuffer latin1 Mojibake)', async () => {
    const payload = {
      title: 'إعلان عربي',
      body: 'مرحبا 🐪',
      listings: [{ id: '1', title: 'أغنام للبيع' }],
    };
    const res = await dedupeGetResponse('ar-feed', async () =>
      jsonResponse(payload),
    );
    const parsed = await res.json();
    expect(parsed).toEqual(payload);
    expect(JSON.stringify(parsed)).not.toMatch(/Ø/);
  });

  it('parses Retry-After and blocks rapid retry after 429', () => {
    expect(parseRetryAfterMs('120')).toBe(120_000);
    const wait = noteRateLimitFromResponse(
      { status: 429, headers: { get: () => '45' } },
      { retryAfter: 45 },
    );
    expect(wait).toBe(45_000);
    expect(isRateLimited()).toBe(true);
    expect(msUntilRateLimitClears()).toBeGreaterThan(40_000);
  });

  it('uses exponential backoff for feed retries and respects 429 window', () => {
    noteRateLimitFromResponse({ status: 429, headers: { get: () => '30' } });
    // Allow 1–2ms clock skew between note and read (CI flake: 29999 vs 30000).
    expect(feedRetryDelayMs(0, 3_000)).toBeGreaterThanOrEqual(29_990);
    resetRequestCoordination();
    expect(feedRetryDelayMs(0, 3_000)).toBe(3_000);
    expect(feedRetryDelayMs(2, 3_000)).toBe(12_000);
  });

  it('fetchPublicFeed dedupes concurrent GETs for the same URL', async () => {
    expect(FEED_TIMEOUT_MS).toBe(12_000);
    fetchWithTimeout.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 15));
      return jsonResponse({ success: true });
    });

    await Promise.all([
      fetchPublicFeed('https://example.test/api/posts', 'token'),
      fetchPublicFeed('https://example.test/api/posts', 'token'),
      fetchPublicFeed('https://example.test/api/posts', 'token'),
    ]);

    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it('home explore and editorial stories cache within TTL', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({
        data: {
          sections: [
            {
              destination: 'listings',
              titleAr: 'السوق',
              descriptionAr: 'اعلانات',
              icon: 'pricetag-outline',
              route: '/(tabs)/market',
            },
          ],
        },
      }),
    );
    fetchWithTimeout.mockResolvedValue(
      jsonResponse({ data: { stories: [{ id: 's1', titleAr: 'خبر' }] } }),
    );

    await fetchHomeExploreSections();
    await fetchHomeExploreSections();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await fetchEditorialStories();
    await fetchEditorialStories();
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it('reuses a fresh result until TTL expires or force is set', () => {
    const now = 1_000_000;
    expect(shouldReuseFreshResult(undefined, 60_000, false, now)).toBe(false);
    expect(shouldReuseFreshResult(now - 10_000, 60_000, false, now)).toBe(true);
    expect(shouldReuseFreshResult(now - 61_000, 60_000, false, now)).toBe(false);
    expect(shouldReuseFreshResult(now - 10_000, 60_000, true, now)).toBe(false);
  });

  it('ignores an older generation after a newer request starts', () => {
    const gen = createRequestGeneration();
    const older = gen.next();
    const newer = gen.next();
    expect(gen.isCurrent(older)).toBe(false);
    expect(gen.isCurrent(newer)).toBe(true);
  });
});
