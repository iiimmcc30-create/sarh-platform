import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { motion } from '@/design-system';
import { FILTER_CHIP, MARKET_CHIP } from '@/components/ui/filterChipTokens';

export type FilterChipAppearanceProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  icon?: string;
  selectedCheck?: boolean;
  chevron?: boolean;
  leading?: ReactNode;
  compact?: boolean;
};

/** Theme-aware filter/market chip chrome — same metrics as the former FilterChip. */
export function FilterChipAppearance({
  label,
  selected = false,
  onPress,
  disabled = false,
  style,
  testID,
  icon,
  selectedCheck = false,
  chevron = false,
  leading,
  compact = false,
}: FilterChipAppearanceProps) {
  const { styles, colors } = useThemedStyles((theme) => ({
    styles: createChipStyles(theme.colors, compact),
    colors: theme.colors,
  }));

  const iconColor = selected ? '#FFFFFF' : colors.textSecondary;
  const iconSize = compact ? MARKET_CHIP.iconSize : 15;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && !disabled && styles.chipPressed,
        disabled && styles.chipDisabled,
        style,
      ]}
    >
      <View style={[styles.inner, getRtlRow()]}>
        {selected && selectedCheck ? (
          <View style={styles.checkCircle}>
            <AppIcon name="checkmark" size={compact ? 9 : 11} color={colors.electricBright} />
          </View>
        ) : leading ? (
          leading
        ) : icon ? (
          <AppIcon name={icon} size={iconSize} color={iconColor} />
        ) : null}
        <Text numberOfLines={1} style={[styles.label, selected && styles.labelSelected]}>
          {label}
        </Text>
        {chevron ? <AppIcon name="angle-down" size={compact ? 11 : 13} color={iconColor} /> : null}
      </View>
    </Pressable>
  );
}

export function createChipStyles(colors: ThemeColors, compact: boolean) {
  const tokens = compact ? MARKET_CHIP : FILTER_CHIP;
  const idleBackground = colors.royal || FILTER_CHIP.idleSurfaceFallback;
  const idleBorderWidth = compact ? 0 : StyleSheet.hairlineWidth;
  return StyleSheet.create({
    chip: {
      height: tokens.height,
      paddingHorizontal: tokens.paddingHorizontal,
      borderRadius: tokens.radius,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
      flexShrink: 0,
      flexGrow: 0,
      maxWidth: '100%',
      backgroundColor: idleBackground,
      borderWidth: idleBorderWidth,
      borderColor: colors.borderSoft,
      overflow: 'hidden',
    },
    chipSelected: {
      backgroundColor: colors.electricBright,
      borderColor: colors.electricBright,
    },
    chipPressed: {
      opacity: motion.press.opacity,
    },
    chipDisabled: {
      opacity: 0.45,
    },
    inner: {
      alignItems: 'center',
      gap: tokens.gap,
      maxWidth: '100%',
    },
    checkCircle: {
      width: compact ? MARKET_CHIP.checkSize : 18,
      height: compact ? MARKET_CHIP.checkSize : 18,
      borderRadius: compact ? MARKET_CHIP.checkSize / 2 : 9,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      ...typography.caption,
      fontSize: tokens.fontSize,
      lineHeight: tokens.lineHeight,
      color: colors.textPrimary,
      textAlign: 'center',
      writingDirection: 'rtl',
      includeFontPadding: false,
    },
    labelSelected: {
      color: '#FFFFFF',
    },
  });
}
