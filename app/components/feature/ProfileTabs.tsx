import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { AppScrollView } from '@/components/ui/AppScrollView';
import { SwipeTabIndicator } from '@/components/ui/SwipeTabIndicator';
import { AppText } from '@/design-system/components';
import { duration } from '@/design-system/tokens';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import { useRevealActiveTab, useTabLayouts } from '@/hooks/useTabLayouts';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import {
  type ProfileTabDef,
  type ProfileTabKey,
  getProfileTabs,
} from '@/lib/profileTabs';

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
  const { width } = useLayout();
  const items = tabs ?? getProfileTabs(isOwnProfile);
  const peekFifth = items.length > 4;
  const tabMinWidth = peekFifth && width > 0 ? Math.floor(width * 0.23) : undefined;
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
        contentContainerStyle={[styles.row, getRtlRow(), peekFifth ? styles.rowPeek : styles.rowFit]}
      >
        {items.map((tab, i) => (
          <ProfileTabButton
            key={tab.key}
            label={tab.label}
            active={activeTab === tab.key}
            minWidth={tabMinWidth}
            flexGrow={peekFifth ? 0 : 1}
            onPress={() => onTabChange(tab.key)}
            onLayout={(event) => onTabLayout(i, event)}
            showOwnIndicator={!progress}
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
  label,
  active,
  onPress,
  onLayout,
  showOwnIndicator,
  minWidth,
  flexGrow,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
  showOwnIndicator: boolean;
  minWidth?: number;
  flexGrow: number;
  styles: ReturnType<typeof createStyles>;
}) {
  const [indicator] = useState(() => new Animated.Value(active ? 1 : 0));

  useEffect(() => {
    Animated.timing(indicator, {
      toValue: active ? 1 : 0,
      duration: duration.fast,
      useNativeDriver: true,
    }).start();
  }, [active, indicator]);

  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      style={[styles.tab, { minWidth, flexGrow }]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <AppText
        variant="label"
        color={active ? 'textPrimary' : 'textMuted'}
        style={active ? styles.tabLabelActive : undefined}
        numberOfLines={1}
      >
        {label}
      </AppText>
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
    rowPeek: {
      flexGrow: 0,
    },
    tab: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      paddingTop: 12,
      paddingBottom: 10,
      position: 'relative',
    },
    tabLabelActive: {
      color: scheme === 'dark' ? colors.textPrimary : colors.electric,
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
