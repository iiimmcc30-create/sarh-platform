import {
  applyAntiDomination,
  extractHashtags,
  extractTopicTokens,
  scoreTrendingSignal,
  type ScoredTrendingItem,
} from './trending-score.util';

describe('trending-score.util', () => {
  it('scores velocity and unique authors higher than raw volume alone', () => {
    const windowMs = 24 * 60 * 60 * 1000;
    const oldHighVolume = scoreTrendingSignal(
      {
        key: 'old',
        label: 'قديم',
        kind: 'topic',
        volume: 40,
        uniqueAuthors: 2,
        engagement: 2,
        recentHalfVolume: 1,
        ageMs: windowMs * 0.9,
      },
      windowMs,
    );
    const freshVelocity = scoreTrendingSignal(
      {
        key: 'new',
        label: 'جديد',
        kind: 'hashtag',
        volume: 12,
        uniqueAuthors: 10,
        engagement: 40,
        recentHalfVolume: 11,
        ageMs: windowMs * 0.05,
      },
      windowMs,
    );
    expect(freshVelocity).toBeGreaterThan(oldHighVolume);
  });

  it('applies anti-domination for similar stems', () => {
    const items: ScoredTrendingItem[] = [
      {
        tag: '#غنم',
        kind: 'hashtag',
        count: 10,
        score: 50,
        uniqueAuthors: 5,
        engagement: 20,
      },
      {
        tag: '#غنمي',
        kind: 'hashtag',
        count: 8,
        score: 48,
        uniqueAuthors: 4,
        engagement: 10,
      },
      {
        tag: '#إبل',
        kind: 'hashtag',
        count: 6,
        score: 40,
        uniqueAuthors: 3,
        engagement: 8,
      },
    ];
    const out = applyAntiDomination(items, 5);
    expect(out.map((i) => i.tag)).toEqual(['#غنم', '#إبل']);
  });

  it('extracts hashtags and topic tokens', () => {
    expect(extractHashtags('بيع #غنم في الرياض')).toContain('#غنم');
    expect(extractTopicTokens('بيع غنم نجيبة في السوق')).toEqual(
      expect.arrayContaining(['غنم', 'نجيبة', 'السوق']),
    );
  });
});
