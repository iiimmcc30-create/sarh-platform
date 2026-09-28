import {
  SearchService,
  TRENDING_CACHE_PREFIX,
  computeTrending,
  type TrendingPostInput,
} from './search.service';

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-09-28T09:00:00Z').getTime();
const WINDOW = 24 * HOUR;

function post(
  text: string,
  authorId: string,
  hoursAgo = 1,
  extra: Partial<TrendingPostInput> = {},
): TrendingPostInput {
  return {
    content: text,
    arabicContent: text,
    authorId,
    createdAt: new Date(NOW - hoursAgo * HOUR),
    likesCount: 1,
    commentsCount: 0,
    repostsCount: 0,
    ...extra,
  };
}

const run = (posts: TrendingPostInput[], limit = 20) =>
  computeTrending(posts, {
    windowMs: WINDOW,
    midpoint: NOW - WINDOW / 2,
    limit,
    now: NOW,
  });

describe('trending: whole hashtags, no fragments', () => {
  it('#اذكرو_الله trends as #اذكرو_الله - never #اذكرو or #الله', () => {
    const trending = run([
      post('ماشاء الله #اذكرو_الله', 'u1'),
      post('#اذكرو_الله دائماً', 'u2'),
      post('اذكرو الله #اذكرو_الله', 'u3'),
    ]);
    const tags = trending.map((t) => t.tag);
    expect(tags[0]).toBe('#اذكرو_الله');
    expect(trending[0]).toMatchObject({
      kind: 'hashtag',
      count: 3,
      uniqueAuthors: 3,
      displayTag: '#اذكرو_الله',
      normalizedTag: '#اذكرو_الله',
      tokenCount: 2,
    });
    for (const fragment of ['#اذكرو', '#الله', 'اذكرو', 'الله']) {
      expect(tags).not.toContain(fragment);
    }
  });

  it('#صلوا_على_النبي stays whole', () => {
    const tags = run([
      post('#صلوا_على_النبي', 'u1'),
      post('#صلوا_على_النبي', 'u2'),
    ]).map((t) => t.tag);
    expect(tags).toContain('#صلوا_على_النبي');
    expect(tags).not.toEqual(expect.arrayContaining(['#صلوا']));
  });

  it('keeps the five example hashtags as independent topics', () => {
    const tags = run([
      post('#اذكرو_الله', 'a'),
      post('#صلوا_على_النبي', 'b'),
      post('#حلال_الطيبين', 'c'),
      post('#ابل_السعودية', 'd'),
      post('#مزاد_الابل', 'e'),
      post('#ابل', 'f'),
      post('#حلال', 'g'),
    ]).map((t) => t.tag);
    for (const tag of [
      '#اذكرو_الله',
      '#صلوا_على_النبي',
      '#حلال_الطيبين',
      '#ابل_السعودية',
      '#مزاد_الابل',
    ]) {
      expect(tags).toContain(tag);
    }
    // Multi-word tags are not merged with single-word tags sharing a stem.
    expect(tags).toContain('#ابل');
    expect(tags).toContain('#حلال');
  });

  it('a real #الله tag is its own topic, but never produced by splitting', () => {
    const tags = run([post('#اذكرو_الله', 'u1'), post('#الله', 'u2')]).map(
      (t) => t.tag,
    );
    expect(tags).toEqual(expect.arrayContaining(['#اذكرو_الله', '#الله']));
    const onlyCompound = run([
      post('#اذكرو_الله', 'u1'),
      post('#اذكرو_الله', 'u2'),
    ]).map((t) => t.tag);
    expect(onlyCompound).toEqual(['#اذكرو_الله']);
  });

  it('short generic words never beat full hashtags', () => {
    const trending = run([
      post('الله الله يا سوق', 'u1'),
      post('الله كريم', 'u2'),
      post('الله يوفق', 'u3'),
      post('#حلال_الطيبين', 'u4'),
    ]);
    const tags = trending.map((t) => t.tag);
    expect(tags).not.toContain('الله');
    expect(tags[0]).toBe('#حلال_الطيبين');
  });

  it('counts a post once even when content and arabicContent repeat it', () => {
    const [top] = run([post('#مزاد_الابل #مزاد_الابل', 'u1')]);
    expect(top.tag).toBe('#مزاد_الابل');
    expect(top.count).toBe(1);
  });

  it('single-author plain words are not topics; multi-author words can be', () => {
    const tags = run([
      post('نعيمي ممتاز', 'u1'),
      post('نعيمي ممتاز', 'u1', 2),
      post('سواكني', 'u2'),
      post('سواكني', 'u3'),
    ]).map((t) => t.tag);
    expect(tags).not.toContain('نعيمي');
    expect(tags).toContain('سواكني');
  });

  it('drops plain words that are just a piece of a trending hashtag', () => {
    const tags = run([
      post('#حلال_الطيبين الطيبين', 'u1'),
      post('الطيبين', 'u2'),
    ]).map((t) => t.tag);
    expect(tags).toContain('#حلال_الطيبين');
    expect(tags).not.toContain('الطيبين');
  });

  it('shows the most used display form for alef / ta-marbuta variants', () => {
    const [top] = run([
      post('#ابل_السعودية', 'u1'),
      post('#ابل_السعودية', 'u2'),
      post('#إبل_السعوديه', 'u3'),
    ]);
    expect(top.tag).toBe('#ابل_السعودية');
    expect(top.count).toBe(3);
  });
});

describe('SearchService.getTrending cache', () => {
  const repo = { findRecentPostsForTrending: jest.fn() };
  const cache = { isEnabled: jest.fn(), get: jest.fn(), set: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    cache.set.mockResolvedValue(undefined);
  });

  it('uses the v4 key (stale split v3 payloads are never read) and caches the result', async () => {
    cache.isEnabled.mockReturnValue(true);
    cache.get.mockResolvedValue(null);
    repo.findRecentPostsForTrending.mockResolvedValue([
      post('#اذكرو_الله', 'u1', 0.1),
    ]);
    const service = new SearchService(repo as never, cache as never);
    const result = await service.getTrending({ window: '24h', limit: 5 });
    expect(TRENDING_CACHE_PREFIX).toBe('search:trending:v4');
    expect(cache.get).toHaveBeenCalledWith('search:trending:v4:24h:5');
    expect(cache.set).toHaveBeenCalledWith(
      'search:trending:v4:24h:5',
      result,
      90,
    );
    expect(result.trending.map((t) => t.tag)).toEqual(['#اذكرو_الله']);
  });

  it('returns the cached payload without hitting the database', async () => {
    cache.isEnabled.mockReturnValue(true);
    cache.get.mockResolvedValue({
      trending: [{ tag: '#حلال_الطيبين' }],
      window: '24h',
    });
    const service = new SearchService(repo as never, cache as never);
    const result = await service.getTrending();
    expect(result.trending[0].tag).toBe('#حلال_الطيبين');
    expect(repo.findRecentPostsForTrending).not.toHaveBeenCalled();
  });
});
