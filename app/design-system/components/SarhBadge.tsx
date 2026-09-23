import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { getRtlRow } from '@/lib/rtl';
import { motion, radius, space } from '../tokens';
import { AppText } from './AppText';
import { resolveSarhBadgeColors, type SarhBadgeTone } from './resolvers';

export type SarhBadgeProps = {
  label: string;
  tone?: SarhBadgeTone;
  disabled?: boolean;
  leading?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export { resolveSarhBadgeColors } from './resolvers';
export type { SarhBadgeState, SarhBadgeTone } from './resolvers';

export function SarhBadge({
  label,
  tone = 'default',
  disabled = false,
  leading,
  style,
}: SarhBadgeProps) {
  const palette = resolveSarhBadgeColors(tone);
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[
        {
          alignSelf: 'flex-start',
          ...getRtlRow(),
          alignItems: 'center',
          gap: space[4],
          paddingHorizontal: space[8],
          paddingVertical: space[4],
          borderRadius: radius[8],
          backgroundColor: palette.backgroundColor,
          opacity: disabled ? motion.opacity.disabled : 1,
        },
        style,
      ]}
    >
      {leading}
      <AppText variant="micro" color={palette.color}>
        {label}
      </AppText>
    </View>
  );
}

export default SarhBadge;
