import { SarhChipRow } from '@/design-system/components';
import type { RegionSelection } from '@/constants/saudiRegions';
import { regionSelectionLabel } from '@/lib/saudiRegionSearch';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import { MARKET_CHIP } from '@/components/ui/filterChipTokens';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { resolveQuickAccessSurface } from '@/lib/quickAccessSurface';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  regionSelection: RegionSelection;
  onRegionPress: () => void;
  onNearbyPress: () => void;
  onSortPress: () => void;
  onCategoryPress: () => void;
  categoryActive?: boolean;
  categoryPickerOpen?: boolean;
  regionActive?: boolean;
  nearbyActive?: boolean;
  sortActive?: boolean;
  /** Current order label (e.g. الأحدث / الأقدم); defaults to the generic title. */
  sortLabel?: string;
};

/** Region + nearby chips, then paired sort/category bar (reference layout). */
export function MarketFilterBar({
  regionSelection,
  onRegionPress,
  onNearbyPress,
  onSortPress,
  onCategoryPress,
  categoryActive = false,
  categoryPickerOpen = false,
  regionActive = false,
  nearbyActive = false,
  sortActive = false,
  sortLabel = 'الترتيب',
}: Props) {
  const { styles, colors, scheme } = useThemedStyles((theme) => ({
    styles: createStyles(theme.colors, theme.scheme),
    colors: theme.colors,
    scheme: theme.scheme,
  }));
  // Idle chips use the Home quick-access chip colours (bg / border / label + icon).
  const idle = resolveQuickAccessSurface(scheme);

  const regionOpen = regionActive || regionSelection.type !== 'all';
  const regionLabel = regionSelectionLabel(regionSelection);
  const categoryOpen = categoryPickerOpen || categoryActive;
  const accent = colors.electricBright;

  return (
    <View style={styles.wrap}>
      <SarhChipRow contentPaddingHorizontal={spacing.md}>
        <Pressable
          style={({ pressed }) => [
            styles.chip,
            styles.regionChip,
            pressed && styles.chipPressed,
            regionOpen && styles.chipActive,
            getRtlRow(),
          ]}
          onPress={onRegionPress}
          accessibilityRole="button"
          accessibilityLabel={regionLabel}
        >
          <AppIcon
            name="map-marker-outline"
            size={MARKET_CHIP.iconSize}
            color={regionOpen ? accent : idle.contentColor}
          />
          <Text
            style={[styles.chipLabel, regionOpen && styles.chipLabelActive]}
            numberOfLines={1}
          >
            {regionLabel}
          </Text>
          <AppIcon
            name="angle-down"
            size={11}
            color={regionOpen ? accent : idle.contentColor}
          />
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.chip,
            pressed && styles.chipPressed,
            nearbyActive && styles.chipActive,
            getRtlRow(),
          ]}
          onPress={onNearbyPress}
          accessibilityRole="button"
          accessibilityLabel="القريب"
          accessibilityState={{ selected: nearbyActive }}
          testID="market-nearby-chip"
        >
          <AppIcon
            name="navigation"
            size={MARKET_CHIP.iconSize}
            color={nearbyActive ? accent : idle.contentColor}
          />
          <Text style={[styles.chipLabel, nearbyActive && styles.chipLabelActive]}>القريب</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.chip,
            pressed && styles.chipPressed,
            sortActive && styles.chipActive,
            getRtlRow(),
          ]}
          onPress={onSortPress}
          accessibilityRole="button"
          accessibilityLabel={`الترتيب: ${sortLabel}`}
          accessibilityState={{ selected: sortActive }}
          testID="market-sort-chip"
        >
          <AppIcon
            name="sort-alt"
            size={MARKET_CHIP.iconSize}
            color={sortActive ? accent : idle.contentColor}
          />
          <Text style={[styles.chipLabel, sortActive && styles.chipLabelActive]} numberOfLines={1}>
            {sortLabel}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.chip,
            pressed && styles.chipPressed,
            categoryOpen && styles.chipActive,
            getRtlRow(),
          ]}
          onPress={onCategoryPress}
          accessibilityRole="button"
          accessibilityLabel="التصنيف"
          testID="market-category-chip"
        >
          <AppIcon
            name="apps"
            size={MARKET_CHIP.iconSize}
            color={categoryOpen ? accent : idle.contentColor}
          />
          <Text style={[styles.chipLabel, categoryOpen && styles.chipLabelActive]}>التصنيف</Text>
        </Pressable>
      </SarhChipRow>
    </View>
  );
}

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  // Same tokens as the Home quick-access chips (SarhButton secondary).
  const quickAccess = resolveQuickAccessSurface(scheme);
  const quickAccessPressed = resolveQuickAccessSurface(scheme, true);
  return StyleSheet.create({
    wrap: {
      flexGrow: 0,
      flexShrink: 0,
      paddingTop: 0,
      paddingBottom: spacing.sm,
    },
    chip: {
      height: MARKET_CHIP.height,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: MARKET_CHIP.gap,
      paddingHorizontal: MARKET_CHIP.paddingHorizontal,
      borderRadius: radius.md,
      backgroundColor: quickAccess.backgroundColor,
      borderWidth: 1,
      borderColor: quickAccess.borderColor,
      flexShrink: 0,
    },
    chipPressed: {
      backgroundColor: quickAccessPressed.backgroundColor,
      borderColor: quickAccessPressed.borderColor,
    },
    regionChip: {
      maxWidth: 160,
    },
    chipActive: {
      borderWidth: 1,
      borderColor: colors.electricBright,
      backgroundColor: `${colors.electricBright}14`,
    },
    chipLabel: {
      ...typography.caption,
      fontSize: MARKET_CHIP.fontSize,
      lineHeight: MARKET_CHIP.lineHeight,
      color: quickAccess.contentColor,
      writingDirection: 'rtl',
      includeFontPadding: false,
    },
    chipLabelActive: {
      color: colors.electricBright,
    },
  });
}

export default MarketFilterBar;
