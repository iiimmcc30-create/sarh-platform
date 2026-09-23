import {
  fetchSearchSuggestions,
  mapPostFromSearch,
  resetUnifiedSearchCache,
  unifiedSearch,
} from '@/services/unifiedSearch';
import { resetRequestCoordination } from '@/services/requestCoordination';

jest.mock('@/services/api', () => ({
  ensureApiReachable: async () => 'https://api.test',
}));

function jsonResponse(body: unknown, status = 200): Response {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { get: () => null },
    json: async () => JSON.parse(text),
    text: async () => text,
  } as unknown as Response;
}

const emptySearch = {
  success: true,
  data: {
    query: 'غنم',
    type: 'all',
    groups: [
      {
        type: 'listings',
        items: [
          {
            type: 'listings',
            id: 'l1',
            title: 'غنم حري',
            relevance: 90,
            data: { id: 'l1' },
          },
        ],
        page: 1,
        limit: 8,
        hasMore: false,
      },
    ],
  },
};

describe('unified search client cache', () => {
  beforeEach(() => {
    resetRequestCoordination();
    resetUnifiedSearchCache();
    jest.restoreAllMocks();
  });

  it('reuses a fresh TTL hit instead of issuing a second GET', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(emptySearch));

    const first = await unifiedSearch({ q: 'غنم', type: 'all', page: 1, limit: 8 });
    const second = await unifiedSearch({ q: 'غنم', type: 'all', page: 1, limit: 8 });

    expect(first.groups[0].items).toHaveLength(1);
    expect(second.groups[0].items[0].id).toBe('l1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/search?q=');
  });

  it('dedupes overlapping in-flight searches for the same key', async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    let fetchStarted!: () => void;
    const sawFetch = new Promise<void>((resolve) => {
      fetchStarted = resolve;
    });
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          fetchStarted();
          resolveFetch = resolve;
        }),
    );

    const a = unifiedSearch({ q: 'غنم', type: 'listings', page: 1, limit: 20 });
    const b = unifiedSearch({ q: 'غنم', type: 'listings', page: 1, limit: 20 });
    await sawFetch;
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch?.(
      jsonResponse({
        success: true,
        data: { query: 'غنم', type: 'listings', groups: [] },
      }),
    );
    await Promise.all([a, b]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not share an aborted inflight with a later caller of the same key', async () => {
    const ac = new AbortController();
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      const signal = (init as RequestInit | undefined)?.signal;
      return new Promise<Response>((_resolve, reject) => {
        if (signal?.aborted) {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
          return;
        }
        signal?.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const first = unifiedSearch({
      q: 'غنم',
      type: 'users',
      page: 1,
      limit: 20,
      signal: ac.signal,
    });
    ac.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });

    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { query: 'غنم', type: 'users', groups: [] },
      }),
    );
    const second = await unifiedSearch({ q: 'غنم', type: 'users', page: 1, limit: 20 });
    expect(second.type).toBe('users');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches suggestions separately from search results', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { suggestions: [{ text: 'غنم حري', kind: 'listing' }] },
        }),
      );

    const first = await fetchSearchSuggestions('غنم', 8);
    const second = await fetchSearchSuggestions('غنم', 8);
    expect(first[0].text).toBe('غنم حري');
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/search/suggest');
  });
});

describe('search result mappers', () => {
  it('maps a search post through the community Post mapper so the feed card can render', () => {
    const post = mapPostFromSearch({
      id: 'p1',
      content: 'sheep',
      arabicContent: 'منشور عن #أغنام',
      image: null,
      images: ['https://cdn.example/post.jpg'],
      likesCount: 4,
      repostsCount: 1,
      commentsCount: 2,
      viewsCount: 10,
      createdAt: '2026-09-01T00:00:00.000Z',
      author: {
        id: 'u1',
        username: 'breeder',
        displayName: 'Breeder',
        arabicName: 'مربّي',
        avatar: 'https://cdn.example/a.jpg',
        verified: true,
      },
    });

    expect(post).not.toBeNull();
    expect(post?.id).toBe('p1');
    expect(post?.arabicContent).toBe('منشور عن #أغنام');
    expect(post?.images).toEqual(['https://cdn.example/post.jpg']);
    expect(post?.likes).toBe(4);
    expect(post?.comments).toBe(2);
    expect(post?.author.arabicName).toBe('مربّي');
  });
});
