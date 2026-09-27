import { ExploreSearchService } from './explore-search.service';

describe('ExploreSearchService', () => {
  const getTrending = jest.fn();
  const findActiveAccounts = jest.fn();
  const findExploreListings = jest.fn();
  const findExploreNews = jest.fn();
  const findExploreCategories = jest.fn();
  const findExploreFeedSuppliers = jest.fn();

  const search = { getTrending } as never;
  const repo = {
    findActiveAccounts,
    findExploreListings,
    findExploreNews,
    findExploreCategories,
    findExploreFeedSuppliers,
  } as never;
  const cache = {
    isEnabled: jest.fn().mockReturnValue(false),
    get: jest.fn(),
    set: jest.fn(),
  };

  let service: ExploreSearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ExploreSearchService(search, repo, cache as never);
  });

  it('builds sections from available data only', async () => {
    getTrending.mockResolvedValue({
      trending: [{ tag: '#غنم', count: 3, score: 12, kind: 'hashtag' }],
      window: '24h',
    });
    findActiveAccounts.mockResolvedValue([
      {
        id: 'u1',
        username: 'seller',
        displayName: 'Seller',
        arabicName: 'بائع',
        avatar: null,
        verified: true,
        createdAt: new Date(),
        _count: { followers: 10, posts: 4 },
      },
    ]);
    findExploreListings.mockResolvedValue([]);
    findExploreNews.mockResolvedValue([]);
    findExploreCategories.mockResolvedValue([]);
    findExploreFeedSuppliers.mockResolvedValue([]);

    const result = await service.getExploreFeed();
    expect(result.sections.map((s) => s.type)).toEqual([
      'trending_topics',
      'accounts',
    ]);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('keeps suppliers and news ahead of marketplace sections under the item cap', async () => {
    getTrending.mockResolvedValue({
      trending: Array.from({ length: 8 }, (_, i) => ({
        tag: `#t${i}`,
        count: 3,
        kind: 'hashtag',
      })),
      window: '24h',
    });
    findActiveAccounts.mockResolvedValue(
      Array.from({ length: 4 }, (_, i) => ({
        id: `u${i}`,
        username: `u${i}`,
        verified: false,
        _count: { followers: 1, posts: 1 },
      })),
    );
    findExploreListings.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, category: `c${i}` })),
    );
    findExploreNews.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({
        id: `n${i}`,
        titleAr: 'خبر',
        bodyAr: 'نص',
        createdAt: new Date(),
      })),
    );
    findExploreCategories.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, nameAr: 'تصنيف' })),
    );
    findExploreFeedSuppliers.mockResolvedValue(
      Array.from({ length: 4 }, (_, i) => ({
        id: `s${i}`,
        nameAr: 'مورد',
        verified: true,
      })),
    );

    const result = await service.getExploreFeed();
    const types = result.sections.map((s) => s.type);
    expect(types.slice(0, 4)).toEqual([
      'trending_topics',
      'accounts',
      'feed_suppliers',
      'news',
    ]);
    expect(
      result.sections.find((s) => s.type === 'feed_suppliers')?.items,
    ).toHaveLength(4);
    expect(result.sections.find((s) => s.type === 'news')?.items).toHaveLength(
      3,
    );
    // Marketplace data is still returned for other clients (trimmed by the cap).
    expect(types).toContain('listings');
  });

  it('uses the v2 explore cache key', async () => {
    cache.isEnabled.mockReturnValue(true);
    cache.get.mockResolvedValue({ sections: [] });
    await service.getExploreFeed();
    expect(cache.get).toHaveBeenCalledWith('search:explore:v2:public');
  });

  it('returns redis cache when enabled', async () => {
    cache.isEnabled.mockReturnValue(true);
    cache.get.mockResolvedValue({
      sections: [
        { type: 'trending_topics', title: 't', items: [{ tag: '#x' }] },
      ],
    });
    const result = await service.getExploreFeed();
    expect(result.sections).toHaveLength(1);
    expect(getTrending).not.toHaveBeenCalled();
  });
});
