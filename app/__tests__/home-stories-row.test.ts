import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('Home stories row', () => {
  const home = src('app/(tabs)/index.tsx');
  const row = src('components/feature/HomeStoriesRow.tsx');
  const bar = src('components/feature/StoriesBar.tsx');
  const feed = src('components/market/MarketListingsFeed.tsx');

  it('renders stories directly under the header and before Quick Access, categories and listings', () => {
    const headerAt = home.indexOf('<HomeAppBar');
    const storiesAt = home.indexOf('<HomeStoriesRow />');
    const quickAt = home.indexOf('<HomeQuickAccess />');
    const listAt = home.indexOf('extraHeader={quickAccess}');
    expect(headerAt).toBeGreaterThan(-1);
    expect(storiesAt).toBeGreaterThan(-1);
    expect(storiesAt).toBeLessThan(quickAt);
    expect(quickAt).toBeLessThan(listAt);
    // The header lives in the chrome layer; the list header starts with extraHeader,
    // followed by the market filter/categories bar, then the listings.
    const headerStack = feed.slice(feed.indexOf('const ListHeader = useCallback'));
    expect(headerStack.indexOf('{extraHeader}')).toBeLessThan(
      headerStack.indexOf("{variant === 'home' ? filterBar : null}"),
    );
    expect(home.match(/<HomeStoriesRow/g)).toHaveLength(1);
  });

  it('reuses the existing StoriesBar, stories feed service and its built-in StoryViewer', () => {
    expect(row).toContain("import { StoriesBar } from '@/components/feature/StoriesBar'");
    expect(row).toContain('fetchStoriesFeed(accessToken, { force })');
    expect(row).toContain('<StoriesBar');
    // No new API, viewer or mock data.
    expect(row).not.toMatch(/\bfetch\(/);
    expect(row).not.toContain('/api/');
    expect(row).not.toContain("from '@/components/feature/StoryViewer'");
    expect(row).not.toContain('<StoryViewer');
    expect(row).not.toMatch(/mock|placeholder|dummy/i);
    // Tapping a bubble opens the same StoryViewer the bar always used.
    expect(bar).toContain('const openGroup = (group: StoryGroup) =>');
    expect(bar).toContain('setViewer({ groups, index: Math.max(0, index) })');
    expect(bar).toContain('<StoryViewer');
    expect(bar).toContain('onPress={() => openGroup(group)}');
  });

  it('keeps the section compact via the StoriesBar size prop (default unchanged)', () => {
    expect(bar).toContain('const DEFAULT_CIRCLE = 64;');
    expect(bar).toContain('size = DEFAULT_CIRCLE');
    expect(row).toContain('HOME_STORY_RING_SIZE = 56');
    expect(row).toContain('size={HOME_STORY_RING_SIZE}');
    expect(bar).toContain('horizontal');
  });

  it('hides when there are no stories and never blocks Home', () => {
    expect(row).toContain('if (!hasAnyStories(state)) return null;');
    expect(row).toContain('/* silent: Home never blocks on stories */');
    expect(row).toContain('useFocusEffect');
    expect(home).not.toContain('fetchStoriesFeed');
  });

  it('stays RTL-safe and within the design system', () => {
    for (const text of [row, home]) {
      expect(text).not.toContain('row-reverse');
      expect(text).not.toMatch(/(margin|padding)(Left|Right):/);
      expect(text).not.toContain('LinearGradient');
      expect(text).not.toContain('react-native-reanimated');
    }
  });
});
