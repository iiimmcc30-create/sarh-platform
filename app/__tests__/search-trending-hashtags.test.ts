/**
 * Search: trending topics show FULL hashtags (never fragments) and a tap
 * searches the full hashtag. Source-level + pure helpers (no render lib).
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  TRENDING_SECTION_TITLE,
  toTrendingRows,
  trendingDisplayTitle,
} from '@/lib/searchTrending';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const search = src('app/search.tsx');

const EXAMPLES = ['#اذكرو_الله', '#صلوا_على_النبي', '#حلال_الطيبين', '#ابل_السعودية', '#مزاد_الابل'];

describe('trending rows keep whole hashtags', () => {
  it('title and tap query are the full tag for every example', () => {
    const rows = toTrendingRows(EXAMPLES.map((tag) => ({ tag, kind: 'hashtag', count: 3 })));
    expect(rows.map((r) => r.title)).toEqual(EXAMPLES);
    expect(rows.map((r) => r.query)).toEqual(EXAMPLES);
    expect(rows.map((r) => r.title)).not.toEqual(expect.arrayContaining(['#اذكرو', '#الله', 'اذكرو', 'الله']));
  });

  it('prefers the API displayTag (as written) over the normalized tag', () => {
    expect(trendingDisplayTitle({ tag: '#ابل_السعوديه', displayTag: '#ابل_السعودية' })).toBe('#ابل_السعودية');
    expect(trendingDisplayTitle({ tag: '#اذكرو_الله' })).toBe('#اذكرو_الله');
    const [row] = toTrendingRows([{ tag: '#ابل_السعوديه', displayTag: '#ابل_السعودية', kind: 'hashtag' }]);
    expect(row.title).toBe('#ابل_السعودية');
    expect(row.query).toBe('#ابل_السعودية');
  });

  it('keeps older API payloads (tag only) working', () => {
    expect(toTrendingRows([{ tag: 'أغنام', kind: 'topic', count: 2 }])[0].title).toBe('أغنام');
  });
});

describe('tapping a trend searches the full hashtag', () => {
  it('row press -> applyQuery(row.query) -> unifiedSearch q, with no trimming of # or _', () => {
    const row = src('components/feature/TrendingTopicRow.tsx');
    expect(row).toContain('onPress={() => onPress(row.query)}');
    expect(search).toContain('<TrendingTopicRow key={row.key} row={row} onPress={applyQuery} />');
    const apply = search.slice(search.indexOf('const applyQuery = useCallback('), search.indexOf('const goHome'));
    expect(apply).toContain('const trimmed = term.trim();');
    expect(apply).toContain('setQuery(trimmed);');
    expect(apply).not.toMatch(/replace\(|normalizeArabic|split\(/);
    const client = src('services/unifiedSearch.ts');
    expect(client).toContain("qs.set('q', params.q.trim());");
  });

  it('URLSearchParams sends the whole tag (encoded) to /api/search', () => {
    const qs = new URLSearchParams();
    qs.set('q', '#اذكرو_الله');
    expect(qs.toString()).toBe(`q=${encodeURIComponent('#اذكرو_الله')}`);
    expect(new URLSearchParams(qs.toString()).get('q')).toBe('#اذكرو_الله');
  });
});

describe('Search page: "المواضيع المتداولة" at the top', () => {
  const explore = search.slice(
    search.indexOf('const renderExploreFeed = () => {'),
    search.indexOf('const newsIdle = ('),
  );

  it('renders the trending section before recent searches and other sections', () => {
    expect(TRENDING_SECTION_TITLE).toBe('المواضيع المتداولة');
    expect(explore).toContain('{TRENDING_SECTION_TITLE}');
    const trendingAt = explore.indexOf('{trendingSections.map(renderSection)}');
    const recentAt = explore.indexOf('{recentSearches.length > 0 ? (');
    const othersAt = explore.indexOf('{otherSections.map(renderSection)}');
    expect(trendingAt).toBeGreaterThan(-1);
    expect(trendingAt).toBeLessThan(recentAt);
    expect(recentAt).toBeLessThan(othersAt);
  });

  it('keeps the Trending tab list and the existing design (no chips / gradients)', () => {
    expect(search).toContain('const trendingRows = useMemo(() => toTrendingRows(trendingItems), [trendingItems]);');
    expect(explore).not.toMatch(/LinearGradient|gradient|shadowColor|trendingChip/);
  });
});
