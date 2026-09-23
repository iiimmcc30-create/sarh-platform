import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';

const SEARCH_H = 48;
const TOOL_H = 36;
const TOOL_ICON = 18;
const SEARCH_ICON = 18;

type Props = {
  onSearch: () => void;
  onFilterPress: () => void;
  onFeaturedPress: () => void;
  featuredActive?: boolean;
  searchPlaceholder?: string;
};

/** Market header: one search field, filter and featured stay inside the bar. */
export function MarketAppBar({
  onSearch,
  onFilterPress,
  onFeaturedPress,
  featuredActive = false,
  searchPlaceholder = 'ابحث في السوق',
}: Props) {
  const { styles, colors } = useThemedStyles((theme) => ({
    styles: createStyles(theme.colors),
    colors: theme.colors,
  }));

  return (
    <View style={styles.shell}>
      <View style={styles.searchRow}>
        <View style={[styles.searchBar, getRtlRow()]}>
          <Pressable
            onPress={onFilterPress}
            style={styles.inlineToolBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="تصفية"
          >
            <AppIcon name="settings-sliders" size={TOOL_ICON} color={colors.textSecondary} />
          </Pressable>

          <Pressable
            onPress={onSearch}
            style={[styles.searchTap, getRtlRow()]}
            accessibilityRole="search"
            accessibilityLabel={searchPlaceholder}
          >
            <AppIcon name="search" size={SEARCH_ICON} color={colors.textMuted} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText style={styles.searchPlaceholder} numberOfLines={1}>
                {searchPlaceholder}
              </AppText>
            </View>
          </Pressable>

          <Pressable
            onPress={onFeaturedPress}
            style={[styles.inlineToolBtn, featuredActive && styles.inlineToolBtnActive]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="الإعلانات المميزة"
            accessibilityState={{ selected: featuredActive }}
          >
            <AppIcon
              name="star"
              size={TOOL_ICON}
              color={featuredActive ? colors.gold : colors.textSecondary}
              variant={featuredActive ? 'sr' : 'rr'}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    shell: {
      backgroundColor: colors.screenRoot,
      flexGrow: 0,
      flexShrink: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
    },
    searchRow: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
    searchBar: {
      width: '100%',
      height: SEARCH_H,
      alignItems: 'center',
      paddingHorizontal: 6,
      backgroundColor: colors.bgField,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    inlineToolBtn: {
      width: TOOL_H,
      height: TOOL_H,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgField,
      borderWidth: 0,
      borderRadius: radius.pill,
      flexShrink: 0,
    },
    inlineToolBtnActive: {
      backgroundColor: `${colors.gold}22`,
    },
    searchTap: {
      flex: 1,
      minWidth: 0,
      height: TOOL_H,
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: spacing.sm,
      backgroundColor: colors.bgField,
      borderRadius: radius.pill,
    },
    searchPlaceholder: {
      ...typography.secondary,
      fontSize: 15,
      color: colors.textMuted,
    },
  });
}

export default MarketAppBar;
