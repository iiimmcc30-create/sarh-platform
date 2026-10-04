import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  INTERACTION_BAR_ALIGN,
  INTERACTION_BAR_JUSTIFY,
  INTERACTION_BAR_MARGIN_TOP,
  INTERACTION_BAR_PADDING_HORIZONTAL,
  INTERACTION_BAR_PADDING_TOP,
  INTERACTION_BAR_STYLE,
  INTERACTION_BOOKMARK_BLUE,
  INTERACTION_BUTTON_STYLE,
  INTERACTION_COUNT_FONT_SIZE,
  INTERACTION_HIT_SLOP,
  INTERACTION_ICON_COUNT_GAP,
  INTERACTION_ICON_SIZE,
  INTERACTION_LIKE_RED,
  INTERACTION_PULSE_DOWN_MS,
  INTERACTION_PULSE_SCALE,
  INTERACTION_PULSE_UP_MS,
  INTERACTION_REPOST_GREEN,
  INTERACTION_TOUCH_MIN,
  SHARE_ICON,
  SHARE_LABEL,
  interactionHitArea,
  shouldShowInteractionCount,
} from '@/lib/interactionActions';
import {
  getListingFavoriteIds,
  isListingFavorited,
  toggleListingFavorite,
} from '@/lib/listingFavorite';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
}

function listSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(path.join(root, dir))) {
    const rel = path.join(dir, name);
    const abs = path.join(root, rel);
    if (statSync(abs).isDirectory()) out.push(...listSources(rel));
    else if (/\.tsx?$/.test(name)) out.push(rel.replace(/\\/g, '/'));
  }
  return out;
}

function between(text: string, start: string, end: string) {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a + start.length);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return text.slice(a, b);
}

function expectOrder(block: string, markers: string[]) {
  let last = -1;
  for (const m of markers) {
    const idx = block.indexOf(m, last + 1);
    expect(idx).toBeGreaterThan(last);
    last = idx;
  }
}

const ORDER = [
  'icon="chatbubble-ellipses-outline"',
  'icon="repeat-2"',
  "icon={",
  'icon="bar-chart-2"',
  "'bookmark' : 'bookmark-outline'",
  '<ShareAction',
];

describe('interaction tokens = Media Viewer values (single source)', () => {
  it('keeps the exact Media Viewer overlay numbers', () => {
    expect(INTERACTION_ICON_SIZE).toBe(20);
    expect(INTERACTION_TOUCH_MIN).toBe(36);
    expect(INTERACTION_HIT_SLOP).toBe(8);
    expect(INTERACTION_ICON_COUNT_GAP).toBe(4);
    expect(INTERACTION_COUNT_FONT_SIZE).toBe(12);
    expect(INTERACTION_BAR_JUSTIFY).toBe('space-between');
    expect(INTERACTION_BAR_ALIGN).toBe('center');
    expect(INTERACTION_BAR_MARGIN_TOP).toBe(4);
    expect(INTERACTION_BAR_PADDING_TOP).toBe(4);
    expect(INTERACTION_BAR_PADDING_HORIZONTAL).toBe(0);
    expect(INTERACTION_BUTTON_STYLE).toEqual({
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      height: 36,
      minWidth: 36,
    });
    expect(INTERACTION_BAR_STYLE).toEqual({
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 4,
      paddingTop: 4,
      paddingHorizontal: 0,
    });
    expect(interactionHitArea()).toBe(52);
    expect(INTERACTION_LIKE_RED).toBe('#F91880');
    expect(INTERACTION_REPOST_GREEN).toBe('#00BA7C');
    expect(INTERACTION_BOOKMARK_BLUE).toBe('#1D9BF0');
  });

  it('shows counts only when positive', () => {
    expect(shouldShowInteractionCount(3)).toBe(true);
    expect(shouldShowInteractionCount(0)).toBe(false);
    expect(shouldShowInteractionCount(undefined)).toBe(false);
    expect(shouldShowInteractionCount(null)).toBe(false);
  });

  it('tap feedback is a light, quick icon pulse (no bounce)', () => {
    expect(INTERACTION_PULSE_SCALE).toBeGreaterThan(1);
    expect(INTERACTION_PULSE_SCALE).toBeLessThanOrEqual(1.15);
    expect(INTERACTION_PULSE_UP_MS + INTERACTION_PULSE_DOWN_MS).toBeLessThanOrEqual(250);
  });

  it('the tokens module stays pure (no React Native import)', () => {
    expect(src('lib/interactionActions.ts')).not.toMatch(/from 'react-native'/);
  });
});

describe('shared InteractionActions component', () => {
  const comp = src('components/ui/InteractionActions.tsx');

  it('takes every size and spacing from the shared tokens', () => {
    expect(comp).toContain('hitSlop={compact ? INTERACTION_COMPACT_HIT_SLOP : INTERACTION_HIT_SLOP}');
    expect(comp).toContain('size={INTERACTION_ICON_SIZE}');
    expect(comp).toContain('...INTERACTION_BUTTON_STYLE');
    expect(comp).toContain('...INTERACTION_BAR_STYLE');
    expect(comp).toContain('fontSize: INTERACTION_COUNT_FONT_SIZE');
    expect(comp).not.toMatch(/hitSlop=\{\d/);
    expect(comp).not.toMatch(/size=\{\d/);
  });

  it('is RTL-aware through getRtlRow on the bar and every button', () => {
    expect(comp).toContain('<View style={[styles.bar, getRtlRow()]}>');
    expect(comp).toContain('[boxStyle, getRtlRow()]');
    expect(comp).not.toContain('row-reverse');
    expect(comp).not.toContain("direction: 'ltr'");
  });

  it('animates only the icon transform with RN Animated timing (no spring, no Reanimated)', () => {
    expect(comp).toContain("from 'react-native'");
    expect(comp).toContain('Animated.timing(scale');
    expect(comp).toContain('Animated.sequence(');
    expect(comp).toContain('useNativeDriver: true');
    expect(comp).toContain('onPress={handlePress}');
    expect(comp).toContain('<Animated.View style={[styles.icon, { transform: [{ scale }] }]}>{iconNode}</Animated.View>');
    expect(comp).not.toContain('onPressIn=');
    expect(comp).not.toContain('Animated.spring');
    expect(comp).not.toContain('bounciness');
    expect(comp).not.toContain('reanimated');
  });

  it('exposes one ShareAction built on the shared glyph and label', () => {
    expect(comp).toContain('export const ShareAction');
    expect(comp).toContain('<InteractionAction icon={SHARE_ICON} label={label} {...rest} />');
    expect(comp).toContain('label = SHARE_LABEL');
    expect(comp).toContain('accessibilityRole="button"');
    expect(comp).toContain('accessibilityState={pending ? { busy: true } : undefined}');
  });
});

describe('Media Viewer consumes the shared source without changing behavior', () => {
  const viewer = src('components/ui/MediaViewerModal.tsx');
  const bar = between(viewer, '<InteractionBar>', '</InteractionBar>');

  it('has no local interaction button or duplicated values left', () => {
    expect(viewer).toContain("from '@/components/ui/InteractionActions'");
    expect(viewer).not.toContain('function OverlayAction');
    expect(viewer).not.toContain('overlayAction:');
    expect(viewer).not.toContain('overlayActions:');
    expect(viewer).not.toContain("'#F91880'");
    expect(viewer).not.toContain('share-up');
  });

  it('keeps the same order, handlers, colors and counts', () => {
    expectOrder(bar, ORDER);
    expect(bar).toContain('onPress={overlay.onComment}');
    expect(bar).toContain('onPress={overlay.onRepost}');
    expect(bar).toContain('onPress={overlay.onLike}');
    expect(bar).toContain('onPress={overlay.onBookmark}');
    expect(bar).toContain('<ShareAction color="#fff" onPress={overlay.onShare} />');
    expect(bar).toContain('count={overlay.comments}');
    expect(bar).toContain('count={overlay.reposts}');
    expect(bar).toContain('count={overlay.likes}');
    expect(bar).toContain('count={overlay.views}');
    expect(bar).toContain('INTERACTION_LIKE_RED');
    expect(bar).toContain('INTERACTION_REPOST_GREEN');
    expect(bar).toContain('INTERACTION_BOOKMARK_BLUE');
    expect(bar.match(/countColor="#fff"/g)?.length).toBe(4);
    expect(bar).not.toContain('formatCount');
  });
});

describe('Feed bar uses the exact same shared bar', () => {
  const post = src('components/feature/PostItem.tsx');
  const bar = between(post, '<InteractionBar>', '</InteractionBar>');

  it('drops the old diverging Feed button and slot styles', () => {
    expect(post).not.toContain('function ActionBtn');
    expect(post).not.toContain('hitSlop={10}');
    expect(post).not.toContain('gap: 5');
    expect(post).not.toContain('actionSlot');
    expect(post).not.toContain('actionEndSlot');
    expect(post).not.toContain('bounciness');
    expect(post).not.toContain("'#F91880'");
    expect(post).not.toContain('share-up');
    expect(post).toContain("from '@/components/ui/InteractionActions'");
    expect(post).toContain("from '@/lib/interactionActions'");
  });

  it('renders the same order through InteractionAction / ShareAction', () => {
    expectOrder(bar, ORDER);
    expect(bar).not.toMatch(/size=\{/);
    expect(bar).not.toMatch(/hitSlop=/);
    expect(bar).toContain('<ShareAction color={colors.textMuted} onPress={onShare} />');
    expect(bar).toContain('onPress={onComment}');
    expect(bar).toContain('onPress={onLike}');
    expect(bar).toContain('pending={likePending}');
    expect(bar).toContain('readOnly');
    expect(bar).toContain('formatCount={formatCount}');
    expect(post.match(/\{actions\}/g)?.length).toBe(3);
  });
});

describe('one app-wide share glyph', () => {
  it('maps SHARE_ICON to the modern Lucide Share2 glyph', () => {
    expect(SHARE_ICON).toBe('share-social-outline');
    expect(SHARE_LABEL).toBe('مشاركة');
    expect(src('lib/lucideIconMap.ts')).toContain("'share-social-outline': Share2,");
  });

  it('uses the shared constant at every share entry point', () => {
    expect(src('app/listing/[id].tsx')).toContain("{ key: 'share', label: SHARE_LABEL, icon: SHARE_ICON }");
    expect(src('app/ministry/index.tsx')).toContain('rightIcon={SHARE_ICON}');
    expect(src('app/users/[id].tsx')).toContain('icon: SHARE_ICON,');
    // Chat no longer carries a per-peer listing binding, so its listing-share action was removed.
    expect(src('app/chat.tsx')).not.toContain('shareListingInChat');
    expect(src('components/feature/LiveStreamItem.tsx')).toContain('<AppIcon name={SHARE_ICON}');
    // StoryViewer is untouched by design; it already uses the same glyph name.
    expect(src('components/feature/StoryViewer.tsx')).toContain('name="share-social-outline"');
  });

  it('leaves no legacy share glyph in app code', () => {
    const files = ['app', 'components', 'lib']
      .filter((d) => existsSync(path.join(root, d)))
      .flatMap(listSources)
      .filter((f) => !f.endsWith('lucideIconMap.ts') && !f.endsWith('flaticonAliases.ts'));
    const offenders = files.filter((f) => /['"](share-up|share-outline)['"]/.test(src(f)));
    expect(offenders).toEqual([]);
  });

  it('keeps share logic untouched', () => {
    expect(src('app/listing/[id].tsx')).toContain('sarhListingShareUrl(listing.id)');
    expect(src('app/ministry/index.tsx')).toContain('await Share.share({');
    expect(src('lib/postInteractions.ts')).toContain('export');
  });
});

describe('listing detail favorite button next to More', () => {
  const detail = src('app/listing/[id].tsx');
  const header = src('components/layout/ScreenHeader.tsx');

  it('sits in the header beside the More button and uses listingFavorite', () => {
    const block = between(detail, 'rightIcon="ellipsis-vertical"', '/>');
    expect(block).toContain('rightAccessibilityLabel="المزيد"');
    expect(block).toContain("secondaryRightIcon={isFavorited ? 'heart' : 'heart-outline'}");
    expect(block).toContain('secondaryRightActive={isFavorited}');
    expect(block).toContain('onSecondaryRightPress={() => void handleToggleFavorite()}');
    expect(detail).toContain("import { isListingFavorited, toggleListingFavorite } from '@/lib/listingFavorite';");
  });

  it('updates state immediately and reconciles with storage', () => {
    const fn = between(detail, 'const handleToggleFavorite = async () => {', 'const showVisitorMenu');
    expect(fn.indexOf('setIsFavorited(!previous)')).toBeGreaterThan(-1);
    expect(fn.indexOf('setIsFavorited(!previous)')).toBeLessThan(fn.indexOf('await toggleListingFavorite(listing.id)'));
    expect(fn).toContain('setIsFavorited(next)');
    expect(fn).toContain('setIsFavorited(previous)');
    expect(detail).toContain("if (key === 'favorite') void handleToggleFavorite();");
  });

  it('matches the More button style and size in ScreenHeader', () => {
    const group = between(header, 'hasSecondary && secondaryRightIcon ? (', ') : (');
    expect(group.match(/styles\.iconBtn, pressed && styles\.iconBtnPressed/g)?.length).toBe(2);
    expect(group.match(/size=\{ds\.icon\.md\}/g)?.length).toBe(2);
    expect(group).toContain('getRtlRow()');
    expect(header).toContain('width: controls.iconButton * 2 + spacing.sm');
    expect(header).not.toMatch(/LinearGradient|shadowOpacity/);
  });

  it('bookmarks favorites tab reads the same store on focus', () => {
    const page = src('app/bookmarks.tsx');
    expect(page).toContain('getListingFavoriteIds');
    expect(page).toContain('useFocusEffect');
  });

  it('save then unsave shows and hides the listing in the favorites ids', async () => {
    await AsyncStorage.clear();
    expect(await toggleListingFavorite('lst-1')).toBe(true);
    expect(await isListingFavorited('lst-1')).toBe(true);
    expect(await getListingFavoriteIds()).toContain('lst-1');
    expect(await toggleListingFavorite('lst-1')).toBe(false);
    expect(await getListingFavoriteIds()).not.toContain('lst-1');
  });
});