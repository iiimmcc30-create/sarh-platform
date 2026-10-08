import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/design-system/components';
import { duration } from '@/design-system/tokens';
import { resolveAppFontFace } from '@/constants/fonts';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow, isAppRtl } from '@/lib/rtl';
import { isHorizontalPagerRtl } from '@/lib/mediaViewerPaging';
import { HEADER_TAB_INDICATOR_THICKNESS, resolveTabPagerMode, revealTabOffset } from '@/lib/tabPager';
import {
  type ProfileTabDef,
  type ProfileTabKey,
  getProfileTabs,
  profileTabRevealRange,
  profileTabTrack,
} from '@/lib/profileTabs';

/** X-style icon tabs: 20pt glyph, label (15/20) beside the selected one only. */
export const PROFILE_TAB_ICON_SIZE = 20;
export const PROFILE_TAB_LABEL_GAP = 6;
export const PROFILE_TAB_ROW_HEIGHT = 20;
/** Label reveal when no pager drives the bar, iOS-like ease-out. */
export const PROFILE_TAB_REVEAL_MS = duration.ui;
/** Touch target: 44pt min width; the 42pt bar gets a 2pt vertical hitSlop each side. */
export const PROFILE_TAB_MIN_TOUCH = 44;
/** Idle slot = icon + md padding each side (never under the 44pt touch target). */
const PROFILE_TAB_BASE_WIDTH = Math.max(PROFILE_TAB_MIN_TOUCH, PROFILE_TAB_ICON_SIZE + spacing.md * 2);
const TAB_HIT_SLOP = { top: 2, bottom: 2, left: 0, right: 0 };
/** Underline drawn at this width and scaled (scaleX) to the selected tab: transform only. */
const INDICATOR_BASE_WIDTH = 100;
const NATIVE_DRIVER = Platform.OS !== 'web';

type ProfileTabsProps = {
  tabs?: ProfileTabDef[];
  activeTab: ProfileTabKey;
  onTabChange: (tab: ProfileTabKey) => void;
  isOwnProfile: boolean;
  /**
   * Swipe pager progress (0 .. tabs - 1, useSwipeTabPager). When given, the
   * label, glyphs and underline follow the pager (finger or tap scroll); with
   * the pager's native driver this all runs on the UI thread.
   */
  progress?: Animated.AnimatedInterpolation<number> | Animated.Value;
};

/**
 * Profile tab bar. Performance model: nothing here re-lays out while a tab
 * change animates. Slot frames for every selected tab are computed once
 * (profileTabTrack); the visible bar is an overlay of icons, labels and one
 * underline moved with translateX / scaleX / opacity interpolated from the
 * pager progress. Touch slots below it change width once per selection.
 */
export const ProfileTabs = memo(function ProfileTabs({
  tabs,
  activeTab,
  onTabChange,
  isOwnProfile,
  progress,
}: ProfileTabsProps) {
  const styles = useThemedStyles(({ colors, scheme }) => createStyles(colors, scheme));
  const { colors } = useTheme();
  const items = useMemo(() => tabs ?? getProfileTabs(isOwnProfile), [isOwnProfile, tabs]);
  const count = items.length;
  const activeIndex = Math.max(0, items.findIndex((tab) => tab.key === activeTab));
  const rtl = isAppRtl();

  const { width: windowWidth } = useWindowDimensions();
  const [viewport, setViewport] = useState(0);
  const rowWidth = viewport > 0 ? viewport : windowWidth;
  const onViewport = useCallback((event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    setViewport((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
  }, []);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffset = useRef(0);

  /** Bold label widths, measured once off-flow (font load / font scale only). */
  const [labelWidths, setLabelWidths] = useState<Record<string, number>>({});
  const onMeasureLabel = useCallback((key: string, event: LayoutChangeEvent) => {
    const w = Math.ceil(event.nativeEvent.layout.width);
    if (!(w > 0)) return;
    setLabelWidths((prev) => (Math.abs((prev[key] ?? 0) - w) < 1 ? prev : { ...prev, [key]: w }));
  }, []);
  const widths = useMemo(() => items.map((tab) => labelWidths[tab.key] ?? 0), [items, labelWidths]);

  const track = useMemo(
    () =>
      profileTabTrack(count, {
        rowWidth,
        labelWidths: widths,
        rtl,
        iconSize: PROFILE_TAB_ICON_SIZE,
        gap: PROFILE_TAB_LABEL_GAP,
        baseWidth: PROFILE_TAB_BASE_WIDTH,
        inset: spacing.md,
      }),
    [count, rowWidth, rtl, widths],
  );

  /** No pager: one value eased to the selected index on the native driver. */
  const [ownProgress] = useState(() => new Animated.Value(activeIndex));
  useEffect(() => {
    if (progress) return;
    Animated.timing(ownProgress, {
      toValue: activeIndex,
      duration: PROFILE_TAB_REVEAL_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: NATIVE_DRIVER,
    }).start();
  }, [activeIndex, ownProgress, progress]);
  const drive = progress ?? ownProgress;

  const motion = useMemo(() => {
    if (!track) return null;
    const { inputRange } = track;
    const along = (outputRange: number[]) => drive.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
    return {
      tabs: items.map((_, i) => {
        const shown = drive.interpolate({ ...profileTabRevealRange(i), extrapolate: 'clamp' });
        return {
          iconX: along(track.iconX[i]),
          // 1px slack each side so the measured text never clips.
          labelX: along(track.labelX[i].map((x) => x - 1)),
          shown,
          hidden: shown.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        };
      }),
      indicatorX: along(track.indicatorCenter.map((c) => c - INDICATOR_BASE_WIDTH / 2)),
      indicatorScale: along(track.indicatorWidth.map((w) => w / INDICATOR_BASE_WIDTH)),
    };
  }, [drive, items, track]);

  const slotWidths = track?.widthsAt[Math.min(activeIndex, count - 1)];
  const pagerMode = resolveTabPagerMode(isHorizontalPagerRtl(), Platform.OS);

  useEffect(() => {
    if (!track || !(viewport > 0)) return;
    const widths = track.widthsAt[Math.min(activeIndex, count - 1)];
    if (!widths) return;
    let start = 0;
    for (let i = 0; i < activeIndex; i += 1) start += widths[i] ?? 0;
    const tabW = widths[activeIndex] ?? 0;
    const tabX = rtl ? track.contentWidth - start - tabW : start;
    const next = revealTabOffset({
      tabX,
      tabWidth: tabW,
      contentWidth: track.contentWidth,
      viewportWidth: viewport,
      currentOffset: scrollOffset.current,
      mode: pagerMode,
      margin: spacing.md,
    });
    if (Math.abs(next - scrollOffset.current) < 1) return;
    scrollOffset.current = next;
    scrollRef.current?.scrollTo({ x: next, y: 0, animated: true });
  }, [activeIndex, count, pagerMode, rtl, track, viewport]);

  const trackWidth = track?.contentWidth;
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={onViewport}
      scrollEventThrottle={16}
      onScroll={(event) => {
        scrollOffset.current = event.nativeEvent.contentOffset.x;
      }}
      style={styles.scroll}
      contentContainerStyle={trackWidth ? { width: trackWidth } : undefined}
    >
    <View style={[styles.bar, trackWidth ? { width: trackWidth } : null]}>
      {/* Touch slots (accessibility + hit areas): one layout pass per selection. */}
      <View style={[styles.row, getRtlRow()]}>
        {items.map((tab, i) => (
          <Pressable
            key={tab.key}
            onPress={() => onTabChange(tab.key)}
            hitSlop={TAB_HIT_SLOP}
            style={[styles.tab, slotWidths ? { width: slotWidths[i] } : styles.tabEven]}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === activeIndex }}
            accessibilityLabel={tab.label}
          >
            <View style={styles.content} />
          </Pressable>
        ))}
      </View>

      {/* Visible bar: physical LTR track, transform + opacity only. */}
      {motion ? (
        <View
          pointerEvents="none"
          style={styles.overlay}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {items.map((tab, i) => {
            const m = motion.tabs[i];
            const active = i === activeIndex;
            return (
              <View key={tab.key} style={StyleSheet.absoluteFill}>
                <Animated.View style={[styles.glyph, { opacity: m.hidden, transform: [{ translateX: m.iconX }] }]}>
                  <AppIcon name={tab.icon} size={PROFILE_TAB_ICON_SIZE} color={colors.textSecondary} variant="rr" strokeWidth={2} />
                </Animated.View>
                <Animated.View style={[styles.glyph, { opacity: m.shown, transform: [{ translateX: m.iconX }] }]}>
                  <AppIcon
                    name={tab.icon}
                    size={PROFILE_TAB_ICON_SIZE}
                    color={colors.electric}
                    variant={tab.activeStyle === 'fill' ? 'sr' : 'rr'}
                    strokeWidth={tab.activeStyle === 'bold' ? 2.5 : 2}
                  />
                </Animated.View>
                <Animated.View
                  style={[
                    styles.label,
                    { width: widths[i] + 2, opacity: m.shown, transform: [{ translateX: m.labelX }] },
                  ]}
                >
                  <AppText
                    variant="label"
                    align="center"
                    color={active ? 'textPrimary' : 'textSecondary'}
                    style={active ? styles.tabLabelActive : styles.tabLabelIdle}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </AppText>
                </Animated.View>
              </View>
            );
          })}
          <Animated.View
            style={[
              styles.indicator,
              { transform: [{ translateX: motion.indicatorX }, { scaleX: motion.indicatorScale }] },
            ]}
          />
        </View>
      ) : null}

      {/* Off-flow copies that measure each bold label's natural width (never shown). */}
      <View
        style={styles.measureBox}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {items.map((tab) => (
          <View key={tab.key} style={styles.measureRow}>
            <AppText
              variant="label"
              style={styles.tabLabelActive}
              numberOfLines={1}
              onLayout={(event) => onMeasureLabel(tab.key, event)}
            >
              {tab.label}
            </AppText>
          </View>
        ))}
      </View>
    </View>
    </ScrollView>
  );
});

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    scroll: {
      flexGrow: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
    },
    bar: {
      backgroundColor: 'transparent',
    },
    row: {
      alignItems: 'stretch',
    },
    /** Same 42pt bar as the text tabs (12 + 20 row + 10). */
    tab: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 12,
      paddingBottom: 10,
      minWidth: PROFILE_TAB_MIN_TOUCH,
    },
    /** Before the first frame is known: even slots. */
    tabEven: {
      flexGrow: 1,
      flexBasis: 0,
    },
    content: {
      height: PROFILE_TAB_ROW_HEIGHT,
    },
    /** Spans the bar and lays out LTR, so translateX is the physical x on native and web. */
    overlay: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      direction: 'ltr',
    },
    glyph: {
      position: 'absolute',
      top: 12,
      left: 0,
      width: PROFILE_TAB_ICON_SIZE,
      height: PROFILE_TAB_ROW_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      position: 'absolute',
      top: 12,
      left: 0,
      height: PROFILE_TAB_ROW_HEIGHT,
      justifyContent: 'center',
    },
    measureBox: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 400,
      opacity: 0,
    },
    measureRow: {
      position: 'absolute',
      top: 0,
      left: 0,
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    /** Active: bold + strong color; idle labels are textSecondary (same contrast as Feed/Search tabs). */
    tabLabelActive: {
      ...resolveAppFontFace('700'),
      color: scheme === 'dark' ? colors.textPrimary : colors.electric,
    },
    /** Fading out: keep the bold face so the label does not reflow while it hides. */
    tabLabelIdle: {
      ...resolveAppFontFace('700'),
    },
    indicator: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      width: INDICATOR_BASE_WIDTH,
      height: HEADER_TAB_INDICATOR_THICKNESS,
      borderRadius: 1,
      backgroundColor: scheme === 'dark' ? colors.textPrimary : colors.electric,
    },
  });
}
