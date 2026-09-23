import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { FilterChipAppearance } from '@/components/ui/filterChipAppearance';
import { getRtlRow } from '@/lib/rtl';
import { motion, radius, space } from '../tokens';
import { AppText } from './AppText';
import { resolveSarhChipColors } from './resolvers';

export type SarhChipAppearance = 'foundation' | 'filter';

export type SarhChipProps = {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  leading?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Foundation = DS dark chip. Filter = live theme FilterChip chrome (market/search). */
  appearance?: SarhChipAppearance;
  compact?: boolean;
  icon?: string;
  selectedCheck?: boolean;
  chevron?: boolean;
};

export { resolveSarhChipColors } from './resolvers';
export type { SarhChipState } from './resolvers';

export function SarhChip({
  label,
  selected = false,
  disabled = false,
  onPress,
  leading,
  style,
  testID,
  appearance = 'foundation',
  compact = false,
  icon,
  selectedCheck = false,
  chevron = false,
}: SarhChipProps) {
  if (appearance === 'filter') {
    return (
      <FilterChipAppearance
        label={label}
        selected={selected}
        disabled={disabled}
        onPress={onPress}
        leading={leading}
        style={style}
        testID={testID}
        compact={compact}
        icon={icon}
        selectedCheck={selectedCheck}
        chevron={chevron}
      />
    );
  }

  const palette = resolveSarhChipColors(selected);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        getRtlRow(),
        {
          alignItems: 'center',
          alignSelf: 'flex-start',
          minHeight: space[32],
          paddingHorizontal: space[12],
          gap: space[8],
          borderRadius: radius[999],
          borderWidth: 1,
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          opacity: disabled ? motion.opacity.disabled : pressed ? motion.opacity.pressed : 1,
        },
        style,
      ]}
    >
      {leading}
      <AppText
        variant="caption"
        color={palette.text}
        numberOfLines={1}
        style={palette.textOverride ? { color: palette.textOverride } : undefined}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

export default SarhChip;
