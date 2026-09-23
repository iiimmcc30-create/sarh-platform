import { UnifiedSearchService } from './unified-search.service';
import { UnifiedSearchRepository } from './repositories/unified-search.repository';

describe('UnifiedSearchService', () => {
  const searchListings = jest.fn();
  const searchPosts = jest.fn();
  const searchButchers = jest.fn();
  const searchNews = jest.fn();
  const searchServices = jest.fn();
  const searchUsers = jest.fn();
  const suggestPrefixes = jest.fn();

  const repo = {
    searchListings,
    searchPosts,
    searchButchers,
    searchNews,
    searchServices,
    searchUsers,
    suggestPrefixes,
  } as unknown as jest.Mocked<UnifiedSearchRepository>;

  const cache = {
    isEnabled: jest.fn().mockReturnValue(false),
    get: jest.fn(),
    set: jest.fn(),
  };

  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  let service: UnifiedSearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UnifiedSearchService(repo, cache as never, logger as never);
  });

  it('returns grouped results for type=all', async () => {
    searchListings.mockResolvedValue([
      {
        id: 'l1',
        title: 'Sheep',
        arabicTitle: 'غنم حري',
        description: '',
        arabicDescription: ' للبيع',
        price: 1000,
        currency: 'SAR',
        category: 'sheep',
        breed: 'حري',
        age: '',
        location: 'Dammam',
        arabicLocation: 'الدمام',
        country: 'SA',
        images: [],
        videoUrl: null,
        thumbnailUrl: null,
        featured: false,
        pinned: false,
        promoted: false,
        promotionWeight: 0,
        createdAt: new Date('2026-08-01'),
        seller: {
          id: 'u1',
          username: 'seller',
          displayName: 'Seller',
          arabicName: 'بائع',
          avatar: null,
          verified: false,
          country: 'SA',
        },
        marketCategory: null,
        marketSubcategory: null,
      },
    ]);
    searchPosts.mockResolvedValue([]);
    searchButchers.mockResolvedValue([]);
    searchNews.mockResolvedValue([]);
    searchServices.mockResolvedValue([]);
    searchUsers.mockResolvedValue([]);

    const result = await service.search({ q: 'غنم حري', type: 'all' });

    expect(result.groups.map((g) => g.type)).toEqual([
      'listings',
      'posts',
      'users',
      'news',
      'services',
    ]);
    expect(result.groups).toHaveLength(5);
    expect(result.groups[0].type).toBe('listings');
    expect(searchUsers).toHaveBeenCalled();
    expect(result.groups[0].items[0].title).toContain('غنم');
    expect(searchListings).toHaveBeenCalled();
  });

  it('matches listings when query alef differs from stored title alef', async () => {
    searchListings.mockResolvedValue([
      {
        id: 'l2',
        title: 'Camels',
        arabicTitle: 'إبل للبيع',
        description: '',
        arabicDescription: 'إبل',
        price: 2000,
        currency: 'SAR',
        category: 'camels',
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
        createdAt: new Date('2026-08-01'),
        seller: {
          id: 'u1',
          username: 'seller',
          displayName: 'Seller',
          arabicName: 'بائع',
          avatar: null,
          verified: false,
          country: 'SA',
        },
        marketCategory: null,
        marketSubcategory: null,
      },
    ]);
    searchPosts.mockResolvedValue([]);
    searchButchers.mockResolvedValue([]);
    searchNews.mockResolvedValue([]);
    searchServices.mockResolvedValue([]);

    const result = await service.search({ q: 'ابل', type: 'listings' });
    expect(searchListings).toHaveBeenCalled();
    const tokens = searchListings.mock.calls[0][0] as string[];
    expect(tokens).toEqual(['ابل']);
    expect(result.groups[0].items[0].title).toContain('إبل');
  });

  it('normalizes suggest prefix so ابل can match folded titles', async () => {
    suggestPrefixes.mockResolvedValue([
      { text: 'إبل للبيع', kind: 'listing', weight: 3 },
    ]);
    const result = await service.suggest('ابل', 5);
    expect(suggestPrefixes).toHaveBeenCalledWith('ابل', 5);
    expect(result.suggestions[0].text).toContain('إبل');
  });

  it('uses redis cache for suggestions when enabled', async () => {
    cache.isEnabled.mockReturnValue(true);
    cache.get.mockResolvedValue([{ text: 'ملاحم', kind: 'listing' }]);

    const result = await service.suggest('مل', 5);
    expect(result.suggestions).toEqual([{ text: 'ملاحم', kind: 'listing' }]);
    expect(suggestPrefixes).not.toHaveBeenCalled();
  });
});
