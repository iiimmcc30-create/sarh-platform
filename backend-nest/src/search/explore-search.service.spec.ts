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
