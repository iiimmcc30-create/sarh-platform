import { FEED_TIMEOUT_MS, fetchPublicFeed } from '../services/fetchPublicFeed';
import { fetchEditorialStories, resetEditorialStoriesCache } from '../services/editorialStories';
import { resetRequestCoordination } from '../services/requestCoordination';

jest.mock('../services/api', () => ({
  API_BASE: 'https://sarh-new4.onrender.com',
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
    statusText: 'OK',
    headers: { get: () => null },
    json: async () => body,
    text: async () => text,
    arrayBuffer: async () => buffer.slice(0),
  } as unknown as Response;
}

describe('home feed speed', () => {
  beforeEach(() => {
    fetchWithTimeout.mockReset();
    resetEditorialStoriesCache();
    resetRequestCoordination();
  });

  it('uses a 12s timeout for public feed GETs', async () => {
    expect(FEED_TIMEOUT_MS).toBe(12_000);
    fetchWithTimeout.mockResolvedValue(jsonResponse({ success: true }));
    await fetchPublicFeed('https://sarh-new4.onrender.com/api/posts', 'token');
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://sarh-new4.onrender.com/api/posts',
      expect.any(Object),
      12_000,
    );
  });

  it('fetches editorial stories with the feed timeout and no health probe', async () => {
    fetchWithTimeout.mockResolvedValue(
      jsonResponse({ data: { stories: [{ id: 's1', titleAr: 'خبر' }] } }),
    );
    const stories = await fetchEditorialStories();
    expect(stories).toHaveLength(1);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://sarh-new4.onrender.com/api/editorial-stories',
      {},
      12_000,
    );
  });
});
