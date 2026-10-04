import { readFileSync } from 'fs';
import path from 'path';
import { INTERACTION_COUNT_FONT_SIZE, INTERACTION_ICON_SIZE, INTERACTION_TOUCH_MIN } from '@/lib/interactionActions';
import {
  HEADER_TAB_INDICATOR_OVERHANG,
  HEADER_TAB_INDICATOR_THICKNESS,
  tabIndicatorFrame,
} from '@/lib/tabPager';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
}

describe('sidebar: feed suppliers + ministry services rows removed (UI only)', () => {
  const panel = src('components/feature/AppSidebar.tsx');

  it('drops both rows and keeps the rest of the primary list', () => {
    expect(panel).not.toContain("key: 'feed-suppliers'");
    expect(panel).not.toContain("key: 'ministry'");
    expect(panel).not.toContain('موردو الأعلاف');
    expect(panel).not.toContain('خدمات الوزارة');
    for (const key of ['profile', 'create-listing', 'verification', 'bookmarks', 'promote']) {
      expect(panel).toContain(`key: '${key}'`);
    }
  });

  it('keeps the screens and other entry points untouched', () => {
    expect(src('app/feed-suppliers/index.tsx')).toContain('export default function FeedSuppliersScreen');
    expect(src('app/ministry/index.tsx')).toContain("value === 'posts' || value === 'services'");
    expect(src('lib/homeQuickAccess.ts')).toContain("HOME_BANNER_CTA_HREF = '/feed-suppliers'");
    expect(src('lib/exploreSarhBanners.ts')).toContain("href: '/ministry'");
  });
});

describe('Search reaches ministry services', () => {
  const search = src('app/search.tsx');

  it('has the «الخدمات» explore tab + results filter opening service details', () => {
    expect(search).toContain("{ id: 'services', label: 'الخدمات' }");
    expect(search).toContain('fetchOfficialServices()');
    expect(search).toContain("pathname: '/ministry/services/[id]'");
  });

  it('links the full ministry services list from the services tab', () => {
    expect(search).toContain("const MINISTRY_SERVICES_HREF = '/ministry?tab=services';");
    expect(search).toContain('router.push(MINISTRY_SERVICES_HREF as never)');
    expect(search).toContain('كل خدمات الوزارة');
  });
});

describe('header tab underline: flush with the header bottom and label-wide', () => {
  const bar = src('components/ui/HomeAppBar.tsx');
  const feed = src('app/(tabs)/posts.tsx');
  const search = src('app/search.tsx');
  const indicator = src('components/ui/SwipeTabIndicator.tsx');

  it('shared tokens: thicker bar that overhangs the label', () => {
    expect(HEADER_TAB_INDICATOR_THICKNESS).toBe(3);
    expect(HEADER_TAB_INDICATOR_OVERHANG).toBe(8);
    expect(indicator).toContain('thickness = HEADER_TAB_INDICATOR_THICKNESS,');
  });

  it('HomeAppBar drops its bottom padding only for tab headers', () => {
    expect(bar).toContain('flushBottom = false,');
    expect(bar).toContain('flushBottom ? styles.innerFlush : null');
    expect(bar).toContain('paddingBottom: space[8],');
    expect(feed).toContain('flushBottom\n');
    expect(search).toContain("flushBottom={phase === 'home' || phase === 'results'}");
    // Home / Chats keep the default padded header.
    expect(src('app/(tabs)/index.tsx')).not.toContain('flushBottom');
    expect(src('app/(tabs)/messages.tsx')).not.toContain('flushBottom');
  });

  it('Feed + Search explore underline spans the label and sits on the bottom edge', () => {
    for (const text of [feed, search]) {
      expect(text).toContain('paddingHorizontal: HEADER_TAB_INDICATOR_OVERHANG,');
      expect(text).toContain('height: HEADER_TAB_INDICATOR_THICKNESS,');
      expect(text).toMatch(/tabIndicator: \{\n\s+position: 'absolute',\n\s+bottom: 0,\n\s+left: 0,\n\s+right: 0,/);
    }
    expect(feed).toContain('backgroundColor: themeColors.electric');
    expect(feed).not.toContain('width: space[20]');
    expect(search).not.toContain('width: 18,');
  });

  it('Search result tabs: sliding indicator spans the whole tab, no strip below', () => {
    expect(search).toContain('inset={RESULT_TAB_INDICATOR_INSET}');
    expect(search).toContain('contentContainerStyle={styles.filterRowContent}');
    expect(search).toMatch(/filterRowContent: \{\n\s+paddingBottom: 0,/);
    // inset 0 → the bar is as wide as the measured tab (label + overhang).
    expect(tabIndicatorFrame({ x: 40, y: 0, width: 72, height: 48 }, { inset: 0 })).toMatchObject({
      x: 40,
      width: 72,
    });
  });
});

describe('header tab labels: stronger contrast', () => {
  it.each(['app/(tabs)/posts.tsx', 'app/search.tsx'])('%s: idle textSecondary, active textPrimary + bold', (rel) => {
    const text = src(rel);
    expect(text).not.toContain("color={active ? 'textPrimary' : 'textMuted'}");
    expect(text).toContain("color={active ? 'textPrimary' : 'textSecondary'}");
    expect(text).toContain('style={active ? styles.tabLabelActive : undefined}');
    expect(text).toMatch(/tabLabelActive: \{\n\s+\.\.\.resolveAppFontFace\('700'\),/);
  });
});

describe('interaction buttons: one step smaller (X), higher contrast, 4-bar views', () => {
  const post = src('components/feature/PostItem.tsx');
  const viewer = src('components/ui/MediaViewerModal.tsx');
  const bar = post.slice(post.indexOf('  const actions = ('), post.indexOf('</InteractionBar>'));

  it('icon 18 / count 11 inside the unchanged fixed 36pt box', () => {
    expect(INTERACTION_ICON_SIZE).toBe(18);
    expect(INTERACTION_COUNT_FONT_SIZE).toBe(11);
    expect(INTERACTION_TOUCH_MIN).toBe(36);
  });

  it('Feed idle icons + counts use textSecondary (not textMuted)', () => {
    expect(bar).not.toContain('colors.textMuted');
    expect(bar.match(/colors\.textSecondary/g)?.length).toBe(6);
  });

  it('Feed + Media Viewer views use the custom 4-bar glyph via AppIcon', () => {
    expect(src('lib/lucideIconMap.ts')).toContain("export const VIEWS_BARS_ICON = 'views-4-bars';");
    expect(post).toContain('icon="views-4-bars"');
    expect(viewer).toContain('icon="views-4-bars"');
    expect(post).not.toContain('bar-chart-2');
    expect(viewer).not.toContain('bar-chart-2');
    const appIcon = src('components/ui/FlaticonIcon.tsx');
    expect(appIcon).toContain('if (name === VIEWS_BARS_ICON) {');
    const glyph = src('components/ui/ViewsBarsIcon.tsx');
    expect(glyph).toContain("from 'react-native-svg'");
    expect(glyph).toContain('viewBox="0 0 24 24"');
    expect(glyph.match(/'M[\d.]+ 20[vV]/g)?.length).toBe(4);
  });
});

describe('Profile tabs: same label contrast as Feed/Search', () => {
  it('idle textSecondary, active bold with its existing strong color', () => {
    const tabs = src('components/feature/ProfileTabs.tsx');
    expect(tabs).not.toContain("color={active ? 'textPrimary' : 'textMuted'}");
    expect(tabs).toContain("color={active ? 'textPrimary' : 'textSecondary'}");
    expect(tabs).toMatch(/tabLabelActive: \{\n\s+\.\.\.resolveAppFontFace\('700'\),\n\s+color: scheme === 'dark' \? colors\.textPrimary : colors\.electric,/);
  });
});

describe('top headers share the bottom tab bar surface; flush tab headers give content a top gap', () => {
  const bar = src('components/ui/HomeAppBar.tsx');
  const search = src('app/search.tsx');
  const feed = src('app/(tabs)/posts.tsx');
  const profile = src('components/feature/ProfileScreenLayout.tsx');
  const tabBar = src('components/navigation/FloatingTabBar.tsx');

  it('HomeAppBar / Search session chrome / Profile sticky tabs use tokens.tabBar (97%, no blur)', () => {
    expect(tabBar).toContain('backgroundColor: tokens.tabBar');
    expect(bar).toContain('backgroundColor: tokens.tabBar,\n      borderBottomColor: tokens.glassBorder,');
    expect(bar).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
    expect(search).not.toMatch(/backgroundColor: tokens\.glass\b,/);
    expect(search.match(/backgroundColor: tokens\.tabBar,/g)?.length).toBe(2);
    expect(profile).toContain("tabsBar: {\n      backgroundColor: (scheme === 'light' ? ds.light : ds.dark).tabBar,");
    for (const text of [bar, search, profile]) expect(text).not.toMatch(/BlurView|expo-blur/);
  });

  it('content (not the header) carries the gap under a flush tab header', () => {
    expect(bar).toContain('export const FLUSH_TABS_CONTENT_GAP = space[12];');
    expect(search).toContain("padTop={collapseEnabled ? 'md' : 'none'}");
    expect(search).toContain("flushBottom={phase === 'home' || phase === 'results'}");
    expect(feed).toContain('paddingTop: headerH + FLUSH_TABS_CONTENT_GAP');
  });
});
