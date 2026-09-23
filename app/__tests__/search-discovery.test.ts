import {
  fetchSearchExplore,
  fetchSearchTrending,
  resetSearchDiscoveryCaches,
} from '../services/searchDiscovery';
import { resetRequestCoordination } from '../services/requestCoordination';

jest.mock('../services/api', () => ({
  ensureApiReachable: async () => 'https://api.test',
}));

describe('searchDiscovery client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    resetSearchDiscoveryCaches();
    resetRequestCoordination();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches explore once and reuses TTL cache', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { sections: [{ type: 'trending_topics', title: 't', items: [] }] },
      }),
    });

    const a = await fetchSearchExplore();
    const b = await fetchSearchExplore();
    expect(a.sections).toHaveLength(1);
    expect(b.sections).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain(
      '/api/search/explore',
    );
  });

  it('does not call /api/users for explore', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { sections: [] } }),
    });
    await fetchSearchExplore();
    const urls = (global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/api/users'))).toBe(false);
  });

  it('caches trending separately from explore', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (String(url).includes('/trending')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { trending: [{ tag: '#غنم', count: 2 }], window: '24h' },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ success: true, data: { sections: [] } }),
      };
    });
    await fetchSearchExplore();
    await fetchSearchTrending();
    await fetchSearchTrending();
    const trendingCalls = (global.fetch as jest.Mock).mock.calls.filter((c) =>
      String(c[0]).includes('/trending'),
    );
    expect(trendingCalls).toHaveLength(1);
  });
});

describe('search screen request policy (source)', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const src = fs.readFileSync(
    path.join(__dirname, '../app/search.tsx'),
    'utf8',
  );

  it('opens with explore feed and no /api/users idle fetch', () => {
    expect(src).toContain('fetchSearchExplore');
    expect(src).not.toContain('/api/users');
    expect(src).toContain("section === 'trending'");
    expect(src).toContain('fetchEditorialStories');
    expect(src).toContain('fetchOfficialServices');
    expect(src).toContain('ListingCard');
  });

  it('keeps butchers out of result rendering path for discovery', () => {
    expect(src).not.toContain("case 'butchers'");
    expect(src).not.toContain('/butchers/[id]');
  });
});
