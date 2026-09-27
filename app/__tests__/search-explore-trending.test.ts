/**
 * Search: X-style Trending list, social-only Explore, unified verified badge.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  EXPLORE_TRENDING_PREVIEW,
  TRENDING_ROW,
  toTrendingRows,
  trendingKindLabel,
  trendingMetaLine,
  trendingPostCountLabel,
} from '@/lib/searchTrending';
import {
  EXPLORE_HIDDEN_SECTIONS,
  EXPLORE_SECTION_ORDER,
  orderExploreSections,
} from '@/lib/searchExplore';
import { FEED_VERIFIED_BADGE_SIZE, VERIFIED_BADGE_GAP } from '@/lib/verifiedBadge';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const search = src('app/search.tsx');

function block(start: string, end: string): string {
  const a = search.indexOf(start);
  const b = search.indexOf(end, a + 1);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return search.slice(a, b);
}

describe('trending topics (view mapping over the existing API)', () => {
  it('maps API items in API order with rank, context and optional count', () => {
    const rows = toTrendingRows([
      { tag: '#السعوديه_عمان', kind: 'hashtag', count: 12 },
      { tag: 'أغنام', kind: 'topic', count: 2 },
      { tag: 'سوق', kind: 'phrase' },
      { tag: 'غامض', kind: 'weird', count: 0 },
    ]);
    expect(rows.map((r) => r.title)).toEqual(['#السعوديه_عمان', 'أغنام', 'سوق', 'غامض']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(rows[0].meta).toBe('1 • وسم • متداول');
    expect(rows[1].meta).toBe('2 • موضوع • متداول');
    expect(rows[2].meta).toBe('3 • عبارة • متداول');
    expect(rows[3].meta).toBe('4 • متداول');
    expect(rows[0].countLabel).toBe('12 منشور');
    expect(rows[1].countLabel).toBe('منشوران');
    expect(rows[2].countLabel).toBeNull();
    expect(rows[3].countLabel).toBeNull();
    expect(rows[0].query).toBe('#السعوديه_عمان');
  });

  it('drops empty and duplicate tags, and renders nothing without data', () => {
    expect(toTrendingRows([{ tag: '' }, { tag: '  ' }, { tag: null }])).toEqual([]);
    expect(toTrendingRows([{ tag: '#A' }, { tag: '#a' }]).map((r) => r.title)).toEqual(['#A']);
    expect(toTrendingRows(undefined)).toEqual([]);
    expect(trendingKindLabel(undefined)).toBeNull();
    expect(trendingMetaLine(7)).toBe('7 • متداول');
    expect(trendingPostCountLabel(5)).toBe('5 منشورات');
    expect(trendingPostCountLabel(1)).toBe('منشور واحد');
  });

  it('uses X-like row metrics: 13px meta, bold 16px title, 16px padding', () => {
    expect(TRENDING_ROW).toMatchObject({
      metaFontSize: 13,
      titleFontSize: 16,
      titleFontWeight: '700',
      paddingHorizontal: 16,
    });
    expect(TRENDING_ROW.paddingVertical).toBeGreaterThanOrEqual(12);
    expect(TRENDING_ROW.paddingVertical).toBeLessThanOrEqual(16);
    const row = src('components/feature/TrendingTopicRow.tsx');
    const styles = row.slice(row.indexOf('StyleSheet.create('));
    expect(styles).not.toMatch(/border|backgroundColor|shadow|elevation|radius/i);
    expect(styles).toContain('fontSize: TRENDING_ROW.metaFontSize');
    expect(styles).toContain('fontSize: TRENDING_ROW.titleFontSize');
    expect(styles).toContain('fontWeight: fontWeight.bold');
    expect(row.indexOf('        {row.meta}\n')).toBeGreaterThan(-1);
    expect(row.indexOf('        {row.meta}\n')).toBeLessThan(row.indexOf('        {row.title}\n'));
  });

  it('renders the Trending tab from the API as a plain list (no chips, no hardcoded topics)', () => {
    expect(search).toContain('void fetchSearchTrending()');
    expect(search).toContain('setTrendingItems(data.trending ?? [])');
    expect(search).toContain('const trendingRows = useMemo(() => toTrendingRows(trendingItems), [trendingItems]);');
    expect(search).not.toContain('trendingChip');
    const lib = src('lib/searchTrending.ts');
    expect(lib).not.toMatch(/#[\u0600-\u06FF]/);
  });

  it('tapping a trend runs the existing search (applyQuery), no new navigation', () => {
    const rows = block('const renderTrendingRows = (rows: TrendingRow[]) =>', 'const trendingRows = useMemo');
    expect(rows).toContain('<TrendingTopicRow key={row.key} row={row} onPress={applyQuery} />');
    expect(rows).not.toMatch(/router\.|safePush/);
    const row = src('components/feature/TrendingTopicRow.tsx');
    expect(row).toContain('onPress={() => onPress(row.query)}');
    expect(row).not.toMatch(/router|safePush/);
  });

  it('shows no fake overflow (three-dot) menu on trend rows', () => {
    const rows = block('const renderTrendingRows = (rows: TrendingRow[]) =>', 'const trendingRows = useMemo');
    expect(rows).not.toMatch(/ellipsis|dots|more-vert|more-horiz/);
    expect(src('components/feature/TrendingTopicRow.tsx')).not.toMatch(/AppIcon|ellipsis|dots-vertical|more-vert/);
  });
});

describe('Explore: social discovery only', () => {
  const explore = block('const renderExploreFeed = () => {', 'const newsIdle = (');

  it('orders trending, suggested accounts, suppliers, then content', () => {
    expect(EXPLORE_SECTION_ORDER).toEqual(['trending_topics', 'accounts', 'feed_suppliers', 'news']);
    const shuffled = [
      { type: 'news', items: [1] },
      { type: 'feed_categories', items: [1] },
      { type: 'feed_suppliers', items: [1] },
      { type: 'listings', items: [1] },
      { type: 'accounts', items: [1] },
      { type: 'trending_topics', items: [1] },
    ];
    expect(orderExploreSections(shuffled).map((s) => s.type)).toEqual([
      'trending_topics',
      'accounts',
      'feed_suppliers',
      'news',
    ]);
  });

  it('hides empty sections and never renders listings or market categories', () => {
    expect(EXPLORE_HIDDEN_SECTIONS).toEqual(['listings', 'feed_categories']);
    expect(
      orderExploreSections([
        { type: 'accounts', items: [] },
        { type: 'listings', items: [{ id: 'l' }] },
        { type: 'feed_suppliers', items: null },
      ]),
    ).toEqual([]);
    expect(explore).toContain('const visibleSections = orderExploreSections(exploreSections);');
    expect(explore).not.toContain('ListingCard');
    expect(explore).not.toContain("'listings'");
    expect(explore).not.toContain('feed_categories');
    expect(explore).not.toContain('/market/categories');
    expect(explore).not.toMatch(/\bads?\b|إعلان/);
  });

  it('previews the real trending section at the top of Explore', () => {
    expect(EXPLORE_TRENDING_PREVIEW).toBe(5);
    expect(explore).toContain('toTrendingRows(sec.items as ExploreTrendingItem[]).slice(');
    expect(explore.indexOf("sec.type === 'trending_topics'")).toBeLessThan(explore.indexOf("sec.type === 'accounts'"));
    expect(explore.indexOf("sec.type === 'accounts'")).toBeLessThan(explore.indexOf("sec.type === 'feed_suppliers'"));
    expect(explore.indexOf("sec.type === 'feed_suppliers'")).toBeLessThan(explore.indexOf("sec.type === 'news'"));
  });
});

describe('search tabs stay wired', () => {
  it('keeps Latest/Users/Ads/Posts/News/Services and ads search results', () => {
    for (const label of ['الأحدث', 'الأشخاص', 'الإعلانات', 'المنشورات', 'الأخبار', 'الخدمات']) {
      expect(search).toContain(`label: '${label}'`);
    }
    expect(search).toContain("{ id: 'listings', label: 'الإعلانات' }");
    const results = block('const renderResult = (item: SearchResultItem) => {', 'const onSearchFocus');
    expect(results).toContain("case 'listings': {");
    expect(results).toContain('<ListingCard');
    expect(results).toContain('mapListingFromSearch(item.data)');
    expect(search).toContain('unifiedSearch({');
  });
});

describe('unified verified badge in search account rows', () => {
  it('UserIdentityRow (search users, explore accounts) uses VerifiedInlineName', () => {
    const row = src('components/ui/UserIdentityRow.tsx');
    expect(row).toContain('<VerifiedInlineName name={displayName} verified={verified}');
    expect(row).not.toContain('<VerificationBadge');
    expect(FEED_VERIFIED_BADGE_SIZE).toBe(14);
    expect(VERIFIED_BADGE_GAP).toBe(4);
  });

  it('search renders accounts only via UserIdentityRow / VerifiedInlineName', () => {
    expect(search).not.toContain('VerificationBadge');
    const users = block("case 'users': {", "case 'posts': {");
    expect(users).toContain('<UserIdentityRow');
    expect(users).toContain('verified={user.verified}');
    const explore = block('const renderExploreFeed = () => {', 'const newsIdle = (');
    expect(explore).toContain('<UserIdentityRow');
    expect(explore).toContain('<VerifiedInlineName name={s.nameAr} verified={s.verified}>');
  });
});