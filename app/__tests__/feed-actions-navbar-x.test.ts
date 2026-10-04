import { readFileSync } from 'fs';
import path from 'path';
import { ds } from '@/constants/designSystem';
import {
  INTERACTION_COMPACT_BUTTON_STYLE,
  INTERACTION_COMPACT_GAP,
  INTERACTION_COMPACT_HIT_SLOP,
  INTERACTION_COMPACT_WIDTH,
  INTERACTION_ICON_SIZE,
  INTERACTION_TOUCH_MIN,
  INTERACTION_TRAILING_GROUP_STYLE,
} from '@/lib/interactionActions';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

function alpha(rgba: string): number {
  const m = rgba.match(/rgba\([^)]*,\s*([0-9.]+)\)/);
  expect(m).not.toBeNull();
  return Number(m?.[1]);
}

describe('X-style action row: 4 equal main actions + compact bookmark/share group', () => {
  it('compact buttons are fixed icon-only boxes with the share icon at the row edge', () => {
    expect(INTERACTION_COMPACT_BUTTON_STYLE).toEqual({
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      width: INTERACTION_COMPACT_WIDTH,
      height: INTERACTION_TOUCH_MIN,
    });
    expect(INTERACTION_COMPACT_WIDTH).toBeGreaterThanOrEqual(INTERACTION_ICON_SIZE + 8);
    expect(INTERACTION_TRAILING_GROUP_STYLE.flexShrink).toBe(0);
    // Horizontal slop never reaches the neighbouring compact button.
    expect(INTERACTION_COMPACT_HIT_SLOP.left + INTERACTION_COMPACT_HIT_SLOP.right).toBeLessThanOrEqual(
      INTERACTION_COMPACT_GAP,
    );
  });

  it('the trailing group renders compact buttons without counts', () => {
    const comp = src('components/ui/InteractionActions.tsx');
    expect(comp).toContain('export function InteractionTrailingGroup');
    expect(comp).toContain('<CompactContext.Provider value>');
    expect(comp).toContain('const countNode = !compact && shouldShowInteractionCount(count)');
    expect(comp).toContain('const boxStyle = compact ? styles.compact : styles.button;');
  });

  it.each(['components/feature/PostItem.tsx', 'components/ui/MediaViewerModal.tsx'])(
    '%s: reply, repost, like, views, then <InteractionTrailingGroup> bookmark + share',
    (rel) => {
      const file = src(rel);
      const bar = file.slice(file.indexOf('<InteractionBar>'), file.indexOf('</InteractionBar>'));
      const order = [
        'icon="chatbubble-ellipses-outline"',
        'icon="repeat-2"',
        "'heart' : 'heart-outline'",
        'icon="views-4-bars"',
        '<InteractionTrailingGroup>',
        "'bookmark' : 'bookmark-outline'",
        '<ShareAction',
        '</InteractionTrailingGroup>',
      ].map((t) => bar.indexOf(t));
      order.forEach((i) => expect(i).toBeGreaterThan(-1));
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    },
  );

  it('PostCardSkeleton mirrors the same row (main slots + compact group)', () => {
    const sk = src('components/ui/skeleton/PostCardSkeleton.tsx');
    expect(sk).toContain('...INTERACTION_BUTTON_STYLE');
    expect(sk).toContain('...INTERACTION_COMPACT_BUTTON_STYLE');
    expect(sk).toContain('...INTERACTION_TRAILING_GROUP_STYLE');
    expect(sk).toContain('<ActionsSkeleton main={FEED_MAIN_ACTIONS} styles={styles} />');
    expect(sk).toContain('<ActionsSkeleton main={FEED_MAIN_ACTIONS - 1} styles={styles} />');
  });
});

describe('X-style bottom tab bar: thin, near-opaque, hairline top border', () => {
  const tabs = src('components/navigation/FloatingTabBar.tsx');

  it('is a single 48px row (was 8 + 52)', () => {
    expect(ds.tabBar.height).toBe(48);
    expect(tabs).toContain('height: ds.tabBar.height');
    expect(tabs).not.toContain('minHeight: 52');
    expect(tabs).not.toContain('paddingTop: spacing.sm');
  });

  it('uses a near-opaque surface (not glassy), hairline border, no shadow', () => {
    for (const bg of [ds.light.tabBar, ds.dark.tabBar]) {
      expect(alpha(bg)).toBeGreaterThanOrEqual(0.95);
      expect(alpha(bg)).toBeLessThan(1);
    }
    expect(tabs).toContain('backgroundColor: tokens.tabBar');
    expect(tabs).toContain('borderTopWidth: StyleSheet.hairlineWidth');
    expect(tabs).not.toContain('ambientShadow');
  });

  it('keeps tabs, order, safe-area handling and route hiding', () => {
    expect(tabs).toContain('Math.max(insets.bottom, ds.tabBar.marginBottom)');
    expect(tabs).toContain('if (tabBarForceHidden || isTabBarHiddenForRoute(activeRoute))');
    expect(tabs).not.toContain('react-native-reanimated');
  });

  it('screen/FAB clearances follow the same token (no hidden content, no extra gap)', () => {
    expect(src('app/(tabs)/_layout.tsx')).toContain(
      'ds.tabBar.height + Math.max(insets.bottom, ds.tabBar.marginBottom)',
    );
    expect(src('design-system/layout/ScreenBody.tsx')).toContain('ds.tabBar.height + insets.bottom');
    const fab = src('components/feature/CreatePostFab.tsx');
    expect(fab).toContain('const TAB_BAR_CLEARANCE = ds.tabBar.height + 24;');
    expect(fab).toContain('const tabBarHeight = ds.tabBar.height + ds.tabBar.marginBottom;');
    expect(fab).not.toMatch(/TAB_BAR_CLEARANCE = \d/);
  });
});
