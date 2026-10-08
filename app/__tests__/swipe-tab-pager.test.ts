import { readFileSync } from 'fs';
import path from 'path';
import { bookmarkPagerIndex, bookmarkPagerOffset } from '@/lib/bookmarks';
import {
  clampTabIndex,
  isTabPageNear,
  resolveSwipeIndex,
  tabPagerIndex,
  tabPagerOffset,
} from '@/lib/tabPager';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const W = 400;

const hook = src('hooks/useSwipeTabPager.ts');
const pagerView = src('components/ui/SwipeTabPager.tsx');
const layout = src('components/feature/ProfileScreenLayout.tsx');
const search = src('app/search.tsx');
const community = src('app/(tabs)/posts.tsx');
const bookmarks = src('app/bookmarks.tsx');

describe('shared swipe-tab pager = the /bookmarks pager', () => {
  it('reuses the exact bookmarks pager math (same functions, not a copy)', () => {
    expect(bookmarkPagerIndex).toBe(tabPagerIndex);
    expect(bookmarkPagerOffset).toBe(tabPagerOffset);
    for (const rtl of [true, false]) {
      for (const count of [2, 3, 4, 5, 6]) {
        for (let i = 0; i < count; i += 1) {
          expect(tabPagerIndex(tabPagerOffset(i, W, count, rtl), W, count, rtl)).toBe(i);
        }
      }
    }
    // RTL: page 0 sits on the right (physical offset (count - 1) * width).
    expect(tabPagerOffset(0, W, 3, true)).toBe(800);
    expect(tabPagerOffset(0, W, 3, false)).toBe(0);
  });

  it('a settled swipe selects once; snapping back to the same page selects nothing', () => {
    expect(resolveSwipeIndex(tabPagerOffset(2, W, 3, true), W, 3, true, 0)).toEqual({ next: 2, vetoed: false });
    expect(resolveSwipeIndex(tabPagerOffset(1, W, 3, true), W, 3, true, 1)).toEqual({ next: null, vetoed: false });
    expect(resolveSwipeIndex(tabPagerOffset(1, W, 2, false), W, 2, false, 0, (i) => i !== 1)).toEqual({
      next: null,
      vetoed: true,
    });
    expect(clampTabIndex(9, 4)).toBe(3);
    expect(clampTabIndex(-2, 4)).toBe(0);
    expect(isTabPageNear(1, 0)).toBe(true);
    expect(isTabPageNear(3, 0)).toBe(false);
  });

  it('keeps the bookmarks behaviour: one index, tap scrolls animated, swipe maps the settled offset', () => {
    expect(hook).toContain('const [index, setIndex] = useState(');
    // Tap: index first, then an animated scroll to the platform-aware page offset.
    expect(hook).toContain('commitIndex(safe);\n      scrollToIndex(safe, true);');
    expect(hook).toContain('const x = tabPagerOffsetForMode(target, widthRef.current, count, mode);');
    expect(hook).toContain('pager?.scrollTo({ x, y: 0, animated });');
    expect(hook).toContain('onMomentumScrollEnd');
    expect(hook).toContain('event.nativeEvent.contentOffset.x');
    expect(hook).toContain('const rtl = isHorizontalPagerRtl();');
    for (const prop of [
      'horizontal: true',
      'pagingEnabled: true',
      'bounces: false',
      'showsHorizontalScrollIndicator: false',
      'scrollEventThrottle: 16',
    ]) {
      expect(hook).toContain(prop);
    }
    expect(pagerView).toContain("direction: rtl ? 'rtl' : 'ltr'");
    expect(pagerView).toContain('const Scroller = nativeDriver ? Animated.ScrollView : ScrollView;');
    expect(pagerView).toContain('<Scroller');
  });

  it('uses RN only: no Reanimated, pager or gesture library', () => {
    for (const text of [hook, pagerView, src('lib/tabPager.ts')]) {
      expect(text).not.toMatch(/react-native-reanimated|react-native-pager-view|react-native-gesture-handler/);
    }
  });

  it('leaves the /bookmarks screen implementation untouched', () => {
    expect(bookmarks).toContain('setIndex(bookmarkPagerIndex(event.nativeEvent.contentOffset.x, width, count, rtl))');
    expect(bookmarks).toContain('scrollTo({ x: bookmarkPagerOffset(next, width, count, rtl), y: 0, animated: true })');
    expect(bookmarks).not.toContain('useSwipeTabPager');
  });
});

describe('Profile tabs swipe', () => {
  it('derives the active tab from the pager index (tap and swipe stay in sync)', () => {
    expect(layout).toContain('useSwipeTabPager({');
    expect(layout).toContain('count: profileTabs.length,');
    expect(layout).toContain("const activeTab: ProfileTabKey = profileTabs[tabPager.index]?.key ?? 'posts';");
    expect(layout).not.toContain('useState<ProfileTabKey>');
    expect(layout).not.toContain('setActiveTab');
  });

  it('tab press animates the pager through goTo', () => {
    expect(layout).toContain('onTabChange={selectTab}');
    expect(layout).toContain('goToTab(Math.max(0, profileTabs.findIndex((tab) => tab.key === key)))');
  });

  it('renders every existing tab content inside the content-height pager, same styles', () => {
    expect(layout).toContain('<SwipeTabPager');
    expect(layout).toContain('fit="content"');
    expect(layout).toContain('pageStyle={[styles.postsFeed, inset]}');
    for (const node of ['postsContent', 'adsContent', 'repliesContent', 'repostsContent', 'likesContent']) {
      expect(layout).toContain(`? ${node}`.replace('? likesContent', ': likesContent'));
    }
    expect(layout).toContain('onTabChange?.(activeTab);');
    expect(layout).toContain("activeTab !== 'ads'");
    expect(layout).toContain('stickyHeaderIndices={[1]}');
    expect(pagerView).toContain("alignItems: 'flex-start'");
    expect(pagerView).toContain("overflow: 'hidden'");
  });
});

describe('Search result tabs swipe', () => {
  it('uses the existing RESULT_SECTIONS as pages; the filter is the pager index', () => {
    expect(search).toContain('useSwipeTabPager({ count: RESULT_SECTIONS.length, width: windowWidth })');
    expect(search).toContain("const filter: SearchFilter = RESULT_SECTIONS[resultPager.index]?.id ?? 'all';");
    expect(search).toContain('onPress={() => goToResultTab(index)}');
    expect(search).not.toContain('setFilter(');
    expect(search).toContain('<SwipeTabPager\n            pager={resultPager}\n            fit="content"');
  });

  it('keeps the query, debounce and search pipeline; the pager never searches', () => {
    expect(search).toContain('const [query, setQuery] = useState(initialQuery);');
    expect(search).toContain('useDebouncedValue(query.trim(), 350)');
    expect(search).toContain('}, [debouncedQuery, filter]);');
    expect(search.match(/unifiedSearch\(\{/g)).toHaveLength(1);
    expect(hook).not.toMatch(/unifiedSearch|fetch\(/);
    expect(pagerView).not.toMatch(/unifiedSearch|fetch\(/);
    // Leaving results resets to the first tab without a request of its own.
    expect(search).toContain('jumpToResultTab(0);');
  });
});

describe('Community tabs swipe', () => {
  it('derives feedTab from the pager index and presses through goTo', () => {
    expect(community).toContain("const FEED_TABS: readonly FeedTab[] = ['for_you', 'following'];");
    expect(community).toContain("const feedTab: FeedTab = FEED_TABS[feedPager.index] ?? 'for_you';");
    expect(community).toContain('feedPager.goTo(FEED_TABS.indexOf(tab));');
    expect(community).toContain('{FEED_TABS.map((tab) => {');
    expect(community).not.toContain('setFeedTab');
  });

  it('guards a signed-out swipe to following like a tap, and mounts only the selected feed', () => {
    expect(community).toContain(
      "canSelect: (i) => FEED_TABS[i] !== 'following' || requireAuth(isAuthenticated, FOLLOWING_AUTH_ACTION),",
    );
    expect(community).toContain('<SwipeTabPager\n          pager={feedPager}');
    expect(community).toContain('active ? (');
    expect(community).toContain('void loadFeed(feedTab, { force: true })');
  });
});