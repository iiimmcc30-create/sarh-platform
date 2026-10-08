import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { AppScrollView } from '@/components/ui/AppScrollView';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { SwipeTabIndicator } from '@/components/ui/SwipeTabIndicator';
import { AppText } from '@/design-system/components';
import { duration } from '@/design-system/tokens';
import { resolveAppFontFace } from '@/constants/fonts';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useRevealActiveTab, useTabLayouts } from '@/hooks/useTabLayouts';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import {
  type ProfileTabDef,
  type ProfileTabKey,
  getProfileTabs,
} from '@/lib/profileTabs';

/** X-style icon tabs: 20pt glyph, label (15/20) beside the selected one only. */
export const PROFILE_TAB_ICON_SIZE = 20;
export const PROFILE_TAB_LABEL_GAP = 6;
export const PROFILE_TAB_ROW_HEIGHT = 20;
/** Label reveal (width + opacity), iOS-like ease-out. */
export const PROFILE_TAB_REVEAL_MS = duration.ui;
/** Touch target: 44pt min width; the 42pt bar gets a 2pt vertical hitSlop each side. */
export const PROFILE_TAB_MIN_TOUCH = 44;
const TAB_HIT_SLOP = { top: 2, bottom: 2, left: 0, right: 0 };

type ProfileTabsProps = {
  tabs?: ProfileTabDef[];
  activeTab: ProfileTabKey;
  onTabChange: (tab: ProfileTabKey) => void;
  isOwnProfile: boolean;
  /**
   * Swipe pager progress (0 .. tabs - 1, useSwipeTabPager). When given, ONE
   * indicator slides under the measured tabs with the drag instead of a
   * per-tab fade.
   */
  progress?: Animated.AnimatedInterpolation<number> | Animated.Value;
};

export function ProfileTabs({
  tabs,
  activeTab,
  onTabChange,
  isOwnProfile,
  progress,
}: ProfileTabsProps) {
  const styles = useThemedStyles(({ colors, scheme }) => createStyles(colors, scheme));
  const { colors } = useTheme();
  const items = tabs ?? getProfileTabs(isOwnProfile);
  const activeIndex = Math.max(0, items.findIndex((tab) => tab.key === activeTab));
  const { layouts, onTabLayout } = useTabLayouts(items.length);
  const { scrollRef, rowProps } = useRevealActiveTab(activeIndex, layouts);

  return (
    <View style={styles.bar}>
      <AppScrollView
        ref={scrollRef}
        {...rowProps}
        horizontal
        bindChromeScroll={false}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={[styles.row, getRtlRow(), styles.rowFit]}
      >
        {items.map((tab, i) => (
          <ProfileTabButton
            key={tab.key}
            tab={tab}
            active={activeTab === tab.key}
            onPress={() => onTabChange(tab.key)}
            onLayout={(event) => onTabLayout(i, event)}
            showOwnIndicator={!progress}
            activeColor={colors.electric}
            idleColor={colors.textSecondary}
            styles={styles}
          />
        ))}
        {progress ? (
          <SwipeTabIndicator
            progress={progress}
            layouts={layouts}
            count={items.length}
            inset={spacing.md}
            color={colors.electric}
            radius={1}
          />
        ) : null}
      </AppScrollView>
    </View>
  );
}

function ProfileTabButton({
  tab,
  active,
  onPress,
  onLayout,
  showOwnIndicator,
  activeColor,
  idleColor,
  styles,
}: {
  tab: ProfileTabDef;
  active: boolean;
  onPress: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
  showOwnIndicator: boolean;
  activeColor: string;
  idleColor: string;
  styles: ReturnType<typeof createStyles>;
}) {
  const { label } = tab;
  const [indicator] = useState(() => new Animated.Value(active ? 1 : 0));
  /** 0 = icon only, 1 = icon + label. JS driver: it animates the label width (layout). */
  const [reveal] = useState(() => new Animated.Value(active ? 1 : 0));
  const [labelWidth, setLabelWidth] = useState(0);

  useEffect(() => {
    Animated.timing(indicator, {
      toValue: active ? 1 : 0,
      duration: duration.fast,
      useNativeDriver: true,
    }).start();
    Animated.timing(reveal, {
      toValue: active ? 1 : 0,
      duration: PROFILE_TAB_REVEAL_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [active, indicator, reveal]);

  const onMeasureLabel = (event: LayoutChangeEvent) => {
    const w = Math.ceil(event.nativeEvent.layout.width);
    if (w > 0 && Math.abs(w - labelWidth) >= 1) setLabelWidth(w);
  };

  const fill = active && tab.activeStyle === 'fill';
  const iconColor = active ? activeColor : idleColor;

  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      hitSlop={TAB_HIT_SLOP}
      style={styles.tab}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <View style={[styles.content, getRtlRow()]}>
        <AppIcon
          name={tab.icon}
          size={PROFILE_TAB_ICON_SIZE}
          color={iconColor}
          variant={fill ? 'sr' : 'rr'}
          strokeWidth={active && tab.activeStyle === 'bold' ? 2.5 : 2}
        />
        {/* Label slot: width 0 -> measured label width (+ gap) and fades in beside the icon. */}
        <Animated.View
          style={[
            styles.labelSlot,
            {
              width: reveal.interpolate({
                inputRange: [0, 1],
                outputRange: [0, labelWidth > 0 ? labelWidth + PROFILE_TAB_LABEL_GAP : 0],
              }),
              opacity: reveal,
            },
          ]}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <View
            style={[
              styles.labelInner,
              getRtlRow(),
              labelWidth > 0 ? { width: labelWidth + PROFILE_TAB_LABEL_GAP } : null,
            ]}
          >
            <View style={styles.labelGap} />
            <AppText
              variant="label"
              color={active ? 'textPrimary' : 'textSecondary'}
              style={active ? styles.tabLabelActive : styles.tabLabelIdle}
              numberOfLines={1}
            >
              {label}
            </AppText>
          </View>
        </Animated.View>
      </View>
      {/* Off-flow copy that measures the bold label's natural width (never shown). */}
      <View
        style={styles.measureBox}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <View style={styles.measureRow}>
          <AppText variant="label" style={styles.tabLabelActive} numberOfLines={1} onLayout={onMeasureLabel}>
            {label}
          </AppText>
        </View>
      </View>
      {showOwnIndicator ? <Animated.View style={[styles.indicator, { opacity: indicator }]} /> : null}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    bar: {
      backgroundColor: 'transparent',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
    },
    row: {
      alignItems: 'stretch',
    },
    rowFit: {
      flexGrow: 1,
    },
    /** Same 42pt bar as the text tabs (12 + 20 row + 10); every tab grows evenly. */
    tab: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      paddingTop: 12,
      paddingBottom: 10,
      minWidth: PROFILE_TAB_MIN_TOUCH,
      flexGrow: 1,
      position: 'relative',
    },
    content: {
      alignItems: 'center',
      height: PROFILE_TAB_ROW_HEIGHT,
    },
    labelSlot: {
      height: PROFILE_TAB_ROW_HEIGHT,
      overflow: 'hidden',
    },
    /** Fixed at the full label width (once measured) so the text never wraps or ellipsizes while the slot opens. */
    labelInner: {
      alignItems: 'center',
      height: PROFILE_TAB_ROW_HEIGHT,
    },
    labelGap: {
      width: PROFILE_TAB_LABEL_GAP,
    },
    measureBox: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 400,
      opacity: 0,
    },
    measureRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    /** Active: bold + strong color; idle labels are textSecondary (same contrast as Feed/Search tabs). */
    tabLabelActive: {
      ...resolveAppFontFace('700'),
      color: scheme === 'dark' ? colors.textPrimary : colors.electric,
    },
    /** Fading out: keep the bold face so the label does not reflow while the slot closes. */
    tabLabelIdle: {
      ...resolveAppFontFace('700'),
    },
    indicator: {
      position: 'absolute',
      bottom: 0,
      start: spacing.md,
      end: spacing.md,
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.electric,
    },
  });
}
