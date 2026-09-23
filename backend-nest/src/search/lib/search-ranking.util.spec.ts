import { rankSearchResults, scoreSearchMatch } from './search-ranking.util';

describe('scoreSearchMatch', () => {
  it('ranks exact title phrase highest', () => {
    const exact = scoreSearchMatch('غنم حري', ['غنم', 'حري'], {
      title: 'غنم حري',
      description: 'للبيع',
    });
    const partial = scoreSearchMatch('غنم حري', ['غنم', 'حري'], {
      title: 'غنم نعيمي',
      description: 'حري',
    });
    expect(exact).toBeGreaterThan(partial);
  });

  it('bonuses results matching all tokens', () => {
    const both = scoreSearchMatch('ملاحم الدمام', ['ملاحم', 'الدمام'], {
      title: 'ملاحم الدمام',
    });
    const one = scoreSearchMatch('ملاحم الدمام', ['ملاحم', 'الدمام'], {
      title: 'ملاحم',
      description: 'الرياض',
    });
    expect(both).toBeGreaterThan(one);
  });
});

describe('rankSearchResults', () => {
  it('sorts by relevance then recency', () => {
    const ranked = rankSearchResults([
      { relevance: 10, createdAt: '2026-01-01' },
      { relevance: 50, createdAt: '2026-02-01' },
      { relevance: 50, createdAt: '2026-03-01' },
    ]);
    expect(ranked[0].relevance).toBe(50);
    expect(ranked[0].createdAt).toBe('2026-03-01');
  });
});
