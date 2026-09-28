import { UnifiedSearchService } from './unified-search.service';
import { UnifiedSearchRepository } from './repositories/unified-search.repository';
import { LivestockDictionaryService } from './terms/livestock-dictionary.service';

function listing(
  id: string,
  arabicTitle: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    title: arabicTitle,
    arabicTitle,
    description: '',
    arabicDescription: '',
    price: 1000,
    currency: 'SAR',
    category: 'sheep',
    breed: '',
    age: '',
    location: 'Riyadh',
    arabicLocation: 'الرياض',
    country: 'SA',
    images: [],
    videoUrl: null,
    thumbnailUrl: null,
    featured: false,
    pinned: false,
    promoted: false,
    promotionWeight: 0,
    createdAt: new Date('2026-09-01'),
    seller: {
      id: 'u1',
      username: 's',
      displayName: 'S',
      arabicName: 'س',
      avatar: null,
      verified: false,
      country: 'SA',
    },
    marketCategory: null,
    marketSubcategory: null,
    ...extra,
  };
}

function postRow(id: string, content: string) {
  return {
    id,
    content,
    arabicContent: content,
    image: null,
    images: [],
    likesCount: 0,
    repostsCount: 0,
    commentsCount: 0,
    viewsCount: 0,
    createdAt: new Date('2026-09-20'),
    author: {
      id: 'a',
      username: 'a',
      displayName: 'A',
      arabicName: 'أ',
      avatar: null,
      verified: false,
    },
  };
}

describe('UnifiedSearchService + livestock dictionary', () => {
  const repo = {
    searchListings: jest.fn(),
    searchPosts: jest.fn(),
    searchPostsByHashtag: jest.fn(),
    searchNews: jest.fn(),
    searchServices: jest.fn(),
    searchUsers: jest.fn(),
    suggestPrefixes: jest.fn(),
  };
  const cache = {
    isEnabled: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    zincrby: jest.fn(),
    zrevrange: jest.fn(),
  };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const trending = { getTrending: jest.fn() };
  const dictionary = new LivestockDictionaryService();

  const make = (withTrending = false) =>
    new UnifiedSearchService(
      repo as unknown as UnifiedSearchRepository,
      cache as never,
      logger as never,
      dictionary,
      withTrending ? (trending as never) : undefined,
    );

  beforeEach(() => {
    jest.resetAllMocks();
    cache.isEnabled.mockReturnValue(false);
    cache.set.mockResolvedValue(undefined);
    cache.zincrby.mockResolvedValue(undefined);
    cache.zrevrange.mockResolvedValue([]);
    for (const fn of [
      'searchListings',
      'searchPosts',
      'searchPostsByHashtag',
      'searchNews',
      'searchServices',
      'searchUsers',
    ]) {
      (repo as Record<string, jest.Mock>)[fn].mockResolvedValue([]);
    }
    repo.suggestPrefixes.mockResolvedValue([]);
  });

  it('search "غنم": expands to sheep aliases; exact title ranks above alias title', async () => {
    repo.searchListings.mockResolvedValue([
      listing('alias', 'خراف نعيمي للبيع'),
      listing('exact', 'غنم نعيمي للبيع'),
    ]);
    const result = await make().search({ q: 'غنم', type: 'listings' });
    const [tokens, , , , expansions] = repo.searchListings.mock.calls[0];
    expect(tokens).toEqual(['غنم']);
    expect(expansions[0]).toEqual(
      expect.arrayContaining(['أغنام', 'خراف', 'ضأن']),
    );
    expect(expansions[0]).not.toContain('ماعز');
    const ids = result.groups[0].items.map((i) => i.id);
    expect(ids).toEqual(['exact', 'alias']);
    expect(result.groups[0].items[1].relevance).toBeGreaterThan(0);
  });

  it('search "حلال": related livestock terms are searched (lower weight)', async () => {
    repo.searchListings.mockResolvedValue([
      listing('goat', 'ماعز شامي', { category: 'goats' }),
      listing('halal', 'حلال طيب'),
    ]);
    const result = await make().search({ q: 'حلال', type: 'listings' });
    const expansions = repo.searchListings.mock.calls[0][4];
    expect(expansions[0]).toEqual(expect.arrayContaining(['غنم', 'ماعز']));
    expect(result.groups[0].items.map((i) => i.id)).toEqual(['halal', 'goat']);
  });

  it('search a local term ("مصغر") also matches its plural and passes posts expansions', async () => {
    repo.searchPosts.mockResolvedValue([postRow('p1', 'عندي مصاغير للبيع')]);
    const result = await make().search({ q: 'مصغر', type: 'posts' });
    const [tokens, , , expansions] = repo.searchPosts.mock.calls[0];
    expect(tokens).toEqual(['مصغر']);
    expect(expansions[0]).toEqual(['مصاغير']);
    expect(result.groups[0].items[0].id).toBe('p1');
  });

  it('an ambiguous term alone is searched exactly (no expansion argument)', async () => {
    await make().search({ q: 'حري', type: 'listings' });
    expect(repo.searchListings.mock.calls[0]).toHaveLength(4);
  });

  it('context in the query boosts listings whose metadata agrees (نعجة حري)', async () => {
    repo.searchListings.mockResolvedValue([
      listing('goat', 'حري نعجة للبيع تيس', { category: 'goats' }),
      listing('sheep', 'حري نعجة للبيع', { category: 'sheep' }),
    ]);
    const result = await make().search({ q: 'نعجة حري', type: 'listings' });
    expect(result.groups[0].items[0].id).toBe('sheep');
  });

  it('advanced animalType param becomes a listing-category filter (optional, backward compatible)', async () => {
    await make().search({ q: 'حري', type: 'listings', animalType: 'goat' });
    expect(repo.searchListings.mock.calls[0][1]).toMatchObject({
      listingCategory: 'goats',
    });
    await make().search({ q: 'حري', type: 'listings' });
    expect(
      repo.searchListings.mock.calls[1][1].listingCategory,
    ).toBeUndefined();
  });

  it('hashtag query searches the FULL tag, not its parts', async () => {
    repo.searchPostsByHashtag.mockResolvedValue([
      postRow('whole', 'ذكر #اذكرو_الله'),
      postRow('longer', 'ذكر #اذكرو_الله_كثيرا'),
    ]);
    const result = await make().search({ q: '#اذكرو_الله', type: 'posts' });
    expect(repo.searchPosts).not.toHaveBeenCalled();
    expect(repo.searchPostsByHashtag.mock.calls[0][0]).toEqual([
      '#اذكرو_الله',
      '#اذكرو_الله',
    ]);
    expect(result.groups[0].items.map((i) => i.id)).toEqual(['whole']);
  });

  it('hashtag query in "all" never searches the fragments اذكرو / الله separately', async () => {
    await make().search({ q: '#اذكرو_الله', type: 'all' });
    expect(repo.searchListings.mock.calls[0][0]).toEqual(['اذكرو الله']);
    expect(repo.searchUsers.mock.calls[0][0]).toEqual(['اذكرو الله']);
  });

  it('Redis: cached payloads are served and new results cached under a versioned key', async () => {
    cache.isEnabled.mockReturnValue(true);
    cache.get.mockResolvedValue(null);
    repo.searchListings.mockResolvedValue([listing('l1', 'غنم للبيع')]);
    await make().search({ q: 'غنم', type: 'listings' });
    const key = cache.set.mock.calls[0][0] as string;
    expect(
      key.startsWith(`search:unified:v2:${dictionary.version}:listings:غنم:`),
    ).toBe(true);
    expect(cache.zincrby).toHaveBeenCalledWith(
      'search:popular:v1',
      'غنم',
      1,
      expect.any(Number),
    );

    cache.get.mockResolvedValue({ query: 'غنم', type: 'listings', groups: [] });
    repo.searchListings.mockClear();
    const cached = await make().search({ q: 'غنم', type: 'listings' });
    expect(repo.searchListings).not.toHaveBeenCalled();
    expect(cached.groups).toEqual([]);
  });

  it('suggest merges listing titles, popular queries, trending hashtags and dictionary terms', async () => {
    cache.isEnabled.mockReturnValue(true);
    cache.get.mockResolvedValue(null);
    repo.suggestPrefixes.mockResolvedValue([
      { text: 'حري للبيع بالقصيم', kind: 'listing', weight: 3 },
    ]);
    cache.zrevrange.mockResolvedValue(['نعيمي', 'حري ثني']);
    trending.getTrending.mockResolvedValue({
      trending: [
        { tag: '#حري_القصيم', displayTag: '#حري_القصيم' },
        { tag: '#اذكرو_الله' },
      ],
    });
    const { suggestions } = await make(true).suggest('حري', 8);
    const texts = suggestions.map((s) => s.text);
    expect(suggestions[0]).toEqual({
      text: 'حري للبيع بالقصيم',
      kind: 'listing',
    });
    expect(texts).toContain('حري ثني');
    expect(texts).toContain('#حري_القصيم');
    expect(texts).not.toContain('#اذكرو_الله');
    expect(texts).not.toContain('نعيمي');
    expect(texts).toEqual(expect.arrayContaining(['نعاج حري', 'حري للبيع']));
    expect(new Set(texts).size).toBe(texts.length);
    expect(cache.set.mock.calls[0][0]).toBe(
      `search:suggest:v3:${dictionary.version}:حري:8`,
    );
  });
});
