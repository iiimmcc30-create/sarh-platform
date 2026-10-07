import { readFileSync } from 'fs';
import path from 'path';
import { HOME_ADD_STORY_LABEL, homeStoriesRowMode } from '../lib/homeStories';

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

  it('decides visibility with the pure helper and never blocks Home', () => {
    expect(row).toContain("if (mode === 'hidden') return null;");
    expect(row).toContain('showAddSlot={mode === \'withAdd\'}');
    expect(row).toContain('const { accessToken, isAuthenticated } = useAuth();');
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

describe('homeStoriesRowMode (Home stories visibility)', () => {
  it('logged in with no stories shows the row with the add-your-story slot', () => {
    expect(homeStoriesRowMode({ isAuthenticated: true, feedCount: 0 })).toBe('withAdd');
    expect(HOME_ADD_STORY_LABEL).toBe('أضف قصتك');
  });

  it('logged in with stories keeps add-your-story first', () => {
    expect(homeStoriesRowMode({ isAuthenticated: true, feedCount: 3 })).toBe('withAdd');
  });

  it('logged out with no stories hides the row', () => {
    expect(homeStoriesRowMode({ isAuthenticated: false, feedCount: 0 })).toBe('hidden');
  });

  it('logged out with stories shows them without the add slot', () => {
    expect(homeStoriesRowMode({ isAuthenticated: false, feedCount: 2 })).toBe('storiesOnly');
  });
});

describe('StoriesBar add slot stays backward compatible', () => {
  const bar = src('components/feature/StoriesBar.tsx');
  const row = src('components/feature/HomeStoriesRow.tsx');

  it('defaults to showing the add slot with the original label', () => {
    expect(bar).toContain('showAddSlot = true,');
    expect(bar).toContain("addLabel = 'إضافة',");
    expect(bar).toContain("{hasMyStories ? 'قصتي' : addLabel}");
    expect(bar).toContain('{showAddSlot ? (');
  });

  it('Home add slot opens the existing story creation screen', () => {
    expect(row).toContain("safePush('/create/story', undefined, router)");
    expect(row).toContain('addLabel={HOME_ADD_STORY_LABEL}');
    expect(src('app/_layout.tsx')).toContain('<Stack.Screen name="create/story"');
  });
});
