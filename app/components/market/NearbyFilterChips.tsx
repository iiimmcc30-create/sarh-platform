import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SarhChipRow } from '@/design-system/components';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { MARKET_CHIP } from '@/components/ui/filterChipTokens';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import { resolveQuickAccessSurface } from '@/lib/quickAccessSurface';
import {
  nearbyChips,
  nearbyOriginLabel,
  type NearbyChip,
  type NearbyState,
} from '@/lib/nearbyFeed';

type Props = {
  state: NearbyState;
  onChip: (chip: NearbyChip) => void;
  /** Change «مدينتك» (city picker). */
  onOriginPress: () => void;
};

/** «القريب» second row: origin city, radius 25/50/100/200 كم, «الأقرب أولاً». */
export function NearbyFilterChips({ state, onChip, onOriginPress }: Props) {
  const { styles, colors, scheme } = useThemedStyles((theme) => ({
    styles: createStyles(theme.colors, theme.scheme),
    colors: theme.colors,
    scheme: theme.scheme,
  }));
  const idle = resolveQuickAccessSurface(scheme);
  const accent = colors.electricBright;
  const chips = nearbyChips(state);
  return (
    <View style={styles.wrap} testID="nearby-filter-chips">
      <SarhChipRow contentPaddingHorizontal={spacing.md}>
        <Pressable
          onPress={onOriginPress}
          style={({ pressed }) => [styles.chip, styles.originChip, pressed && styles.chipPressed, getRtlRow()]}
          accessibilityRole="button"
          accessibilityLabel={`المدينة: ${state.origin.city.nameAr}`}
          testID="nearby-origin-chip"
        >
          <AppIcon
            name={state.origin.kind === 'gps' ? 'navigation' : 'map-marker-outline'}
            size={MARKET_CHIP.iconSize}
            color={idle.contentColor}
          />
          <Text style={styles.chipLabel} numberOfLines={1}>
            {nearbyOriginLabel(state.origin)}
          </Text>
          <AppIcon name="angle-down" size={11} color={idle.contentColor} />
        </Pressable>
        {chips.map((chip) => (
          <Pressable
            key={chip.key}
            onPress={() => onChip(chip)}
            style={({ pressed }) => [
              styles.chip,
              pressed && styles.chipPressed,
              chip.selected && styles.chipActive,
              getRtlRow(),
            ]}
            accessibilityRole="button"
            accessibilityLabel={chip.label}
            accessibilityState={{ selected: chip.selected }}
            testID={`nearby-chip-${chip.key}`}
          >
            {chip.kind === 'nearest' ? (
              <AppIcon
                name="sort-alt"
                size={MARKET_CHIP.iconSize}
                color={chip.selected ? accent : idle.contentColor}
              />
            ) : null}
            <Text style={[styles.chipLabel, chip.selected && styles.chipLabelActive]}>{chip.label}</Text>
          </Pressable>
        ))}
      </SarhChipRow>
    </View>
  );
}

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  const quickAccess = resolveQuickAccessSurface(scheme);
  const quickAccessPressed = resolveQuickAccessSurface(scheme, true);
  return StyleSheet.create({
    wrap: { flexGrow: 0, flexShrink: 0, paddingBottom: spacing.sm },
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
    originChip: { maxWidth: 170 },
    chipPressed: {
      backgroundColor: quickAccessPressed.backgroundColor,
      borderColor: quickAccessPressed.borderColor,
    },
    chipActive: {
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
    chipLabelActive: { color: colors.electricBright },
  });
}

export default NearbyFilterChips;
