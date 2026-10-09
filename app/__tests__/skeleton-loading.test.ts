import { readFileSync } from 'fs';
import path from 'path';
import {
  SKELETON_COLOR_LIGHT,
  SKELETON_PULSE_MIN_OPACITY,
  resolveLoadPhase,
  skeletonFillCount,
  skeletonTextBarHeight,
} from '@/components/ui/skeleton/skeletonTokens';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('resolveLoadPhase — first load vs refresh', () => {
  it('shows the skeleton only while the first load has no data', () => {
    expect(resolveLoadPhase({ hasData: false, loading: true })).toBe('skeleton');
  });

  it('switches to content once data arrives', () => {
    expect(resolveLoadPhase({ hasData: true, loading: false })).toBe('content');
  });

  it('keeps real content visible during refresh / refetch / pagination', () => {
    expect(resolveLoadPhase({ hasData: true, loading: true })).toBe('content');
    expect(resolveLoadPhase({ hasData: true, loading: true, failed: true })).toBe('content');
  });

  it('shows error or empty instead of the skeleton once settled without data', () => {
    expect(resolveLoadPhase({ hasData: false, loading: false, failed: true })).toBe('error');
    expect(resolveLoadPhase({ hasData: false, loading: false })).toBe('empty');
  });
});

describe('skeleton sizing helpers', () => {
  it('fills the viewport within min/max bounds', () => {
    expect(skeletonFillCount(700, 140)).toBe(5);
    expect(skeletonFillCount(5000, 100)).toBe(10);
    expect(skeletonFillCount(50, 140)).toBe(3);
    expect(skeletonFillCount(700, 0)).toBe(3);
    expect(skeletonFillCount(Number.NaN, 140)).toBe(3);
    expect(skeletonFillCount(900, 100, { min: 2, max: 6 })).toBe(6);
  });

  it('keeps text bars inside the real line box', () => {
    expect(skeletonTextBarHeight(16, 24)).toBeLessThanOrEqual(24);
    expect(skeletonTextBarHeight(16, 24)).toBeGreaterThan(6);
    expect(skeletonTextBarHeight(4, 4)).toBe(4);
  });

  it('uses a light grey bone and a calm pulse', () => {
    expect(SKELETON_COLOR_LIGHT).toBe('#EFF1F4');
    expect(SKELETON_PULSE_MIN_OPACITY).toBeGreaterThan(0.3);
    expect(SKELETON_PULSE_MIN_OPACITY).toBeLessThan(1);
  });
});

describe('skeleton primitives', () => {
  const primitives = src('components/ui/skeleton/SkeletonPrimitives.tsx');

  it('animates opacity on the native driver and respects Reduce Motion', () => {
    expect(primitives).toContain('useNativeDriver: true');
    expect(primitives).toMatch(/isReduceMotionEnabled|reduceMotion/i);
    expect(primitives).not.toMatch(/(margin|padding)(Left|Right):/);
  });

  it('announces one accessible loading region', () => {
    expect(primitives).toContain('accessibilityRole="progressbar"');
    expect(primitives).toContain('SKELETON_A11Y_LABEL');
  });
});

const SKELETON_SCREENS = [
  'components/market/MarketListingsFeed.tsx',
  'app/market/browse.tsx',
  'app/search.tsx',
  'app/(tabs)/posts.tsx',
  'app/news.tsx',
  'app/(tabs)/profile.tsx',
  'app/users/[id].tsx',
  'components/feature/ProfileScreenLayout.tsx',
  'app/bookmarks.tsx',
  'app/favorites.tsx',
  'app/profile/connections.tsx',
  'components/feature/MessagesPanel.tsx',
  'app/notifications/index.tsx',
  'app/support/tickets/index.tsx',
  'app/support/faq.tsx',
  'components/settings/SettingsPeopleList.tsx',
  'app/feed-suppliers/index.tsx',
  'app/post/[id].tsx',
  'app/listing/[id].tsx',
  'components/feature/PostCommentsSection.tsx',
  'components/feature/ListingCommentsSection.tsx',
  'app/support/tickets/[id].tsx',
  'app/ministry/index.tsx',
  'app/ministry/services/[id].tsx',
  'app/feed-suppliers/[id].tsx',
  'app/info/policy/[slug].tsx',
  'components/feature/NewMessageSheet.tsx',
  'app/market/categories/[id].tsx',
  'components/feature/ListingCommentsModal.tsx',
];

/** Detail screens whose only spinner was the first-load one. */
const SPINNER_FREE_SCREENS = [
  'app/support/tickets/[id].tsx',
  'app/ministry/index.tsx',
  'app/ministry/services/[id].tsx',
  'app/feed-suppliers/[id].tsx',
  'app/info/policy/[slug].tsx',
  'app/market/categories/[id].tsx',
  'app/post/[id].tsx',
  'app/listing/[id].tsx',
];

describe('first-load skeletons replace full-screen spinners', () => {
  for (const file of SKELETON_SCREENS) {
    it(`${file} renders skeletons on first load`, () => {
      const text = src(file);
      expect(text).toContain("from '@/components/ui/skeleton'");
      expect(text).not.toMatch(/<ActivityIndicator[^>]*size="large"/);
    });
  }

  it('keeps pagination footers as small spinners under real content', () => {
    expect(src('components/market/MarketListingsFeed.tsx')).toContain(
      '{loadingMore ? <ActivityIndicator',
    );
    expect(src('app/market/browse.tsx')).toContain('{loadingMore ? <ActivityIndicator');
  });

  for (const file of SPINNER_FREE_SCREENS) {
    it(`${file} no longer uses ActivityIndicator`, () => {
      expect(src(file)).not.toContain('ActivityIndicator');
    });
  }

  it('gates each first-load skeleton on missing data, so refreshes keep content', () => {
    expect(src('app/support/tickets/[id].tsx')).toContain('loading && !ticket');
    expect(src('app/info/policy/[slug].tsx')).toContain('loading && sections.length === 0');
    expect(src('app/market/categories/[id].tsx')).toContain('loading && subs.length === 0');
    expect(src('components/feature/NewMessageSheet.tsx')).toContain('loading && base.length === 0');
    expect(src('components/feature/ListingCommentsModal.tsx')).toContain(
      'loading && comments.length === 0',
    );
    const ministry = src('app/ministry/index.tsx');
    expect(ministry).toContain('const accountPending = loading && !account;');
    expect(ministry).toContain("tab === 'posts' ? posts.length === 0 : services.length === 0");
  });

  it('shows an error with retry (not an endless spinner) when ministry posts fail', () => {
    const ministry = src('app/ministry/index.tsx');
    expect(ministry).toContain('setPostsLoadFailed(true)');
    expect(ministry).toContain('تعذّر تحميل المنشورات');
  });

  it('does not export skeletons from the design-system barrel', () => {
    expect(src('design-system/index.ts')).not.toContain('Skeleton');
  });
});
