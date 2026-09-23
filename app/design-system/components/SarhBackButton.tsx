import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { rtlBackIcon } from '@/lib/rtl';
import { motion, radius, space } from '../tokens';
import {
  ICON_BUTTON_SIZE,
  resolveSarhIconButtonColors,
  type SarhIconButtonChrome,
  type SarhIconButtonSize,
} from './resolvers';

export type SarhBackButtonProps = {
  onPress?: () => void;
  size?: SarhIconButtonSize;
  chrome?: SarhIconButtonChrome;
  color?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Single back control for Arabic-default RTL.
 * Position belongs to the header row (first child + getRtlRow = inline start).
 * Icon comes only from `rtlBackIcon()` — do not flip per screen.
 */
export function SarhBackButton({
  onPress,
  size = 'md',
  chrome = 'ghost',
  color,
  accessibilityLabel = 'رجوع',
  style,
}: SarhBackButtonProps) {
  const metrics = ICON_BUTTON_SIZE[size];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={space[8]}
      style={({ pressed }) => {
        const palette = resolveSarhIconButtonColors(pressed ? 'pressed' : 'default', chrome);
        return [
          {
            width: metrics.box,
            height: metrics.box,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius[12],
            backgroundColor: chrome === 'ghost' ? 'transparent' : palette.backgroundColor,
            opacity: pressed ? motion.opacity.pressed : 1,
          },
          style,
        ];
      }}
    >
      {({ pressed }) => {
        const palette = resolveSarhIconButtonColors(pressed ? 'pressed' : 'default', chrome);
        return (
          <AppIcon
            name={rtlBackIcon()}
            size={metrics.icon}
            color={color ?? palette.contentColor}
            strokeWidth={2.5}
          />
        );
      }}
    </Pressable>
  );
}

export default SarhBackButton;
