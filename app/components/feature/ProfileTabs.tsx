import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { AppScrollView } from '@/components/ui/AppScrollView';
import { AppText } from '@/design-system/components';
import { duration } from '@/design-system/tokens';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
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
};

export function ProfileTabs({
  tabs,
  activeTab,
  onTabChange,
  isOwnProfile,
}: ProfileTabsProps) {
  const styles = useThemedStyles(({ colors, scheme }) => createStyles(colors, scheme));
  const { width } = useLayout();
  const items = tabs ?? getProfileTabs(isOwnProfile);
  const peekFifth = items.length > 4;
  const tabMinWidth = peekFifth && width > 0 ? Math.floor(width * 0.23) : undefined;

  return (
    <View style={styles.bar}>
      <AppScrollView
        horizontal
        bindChromeScroll={false}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        contentContainerStyle={[styles.row, getRtlRow(), peekFifth ? styles.rowPeek : styles.rowFit]}
      >
        {items.map((tab) => (
          <ProfileTabButton
            key={tab.key}
            label={tab.label}
            active={activeTab === tab.key}
            minWidth={tabMinWidth}
            flexGrow={peekFifth ? 0 : 1}
            onPress={() => onTabChange(tab.key)}
            styles={styles}
          />
        ))}
      </AppScrollView>
    </View>
  );
}

function ProfileTabButton({
  label,
  active,
  onPress,
  minWidth,
  flexGrow,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  minWidth?: number;
  flexGrow: number;
  styles: ReturnType<typeof createStyles>;
}) {
  const indicator = useRef(new Animated.Value(active ? 1 : 0)).current;

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
      <Animated.View style={[styles.indicator, { opacity: indicator }]} />
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
