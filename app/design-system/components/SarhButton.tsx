import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow } from '@/lib/rtl';
import { buttonMetrics, colors, motion } from '../tokens';
import { AppText } from './AppText';
import {
  resolveSarhButtonColorsForScheme,
  type SarhButtonShape,
  type SarhButtonSize,
  type SarhButtonState,
  type SarhButtonVariant,
} from './resolvers';

export type SarhButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: SarhButtonVariant;
  size?: SarhButtonSize;
  shape?: SarhButtonShape;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode | string;
  rightIcon?: ReactNode | string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export { BUTTON_SIZE, resolveSarhButtonColors } from './resolvers';
export type { SarhButtonShape, SarhButtonSize, SarhButtonState, SarhButtonVariant } from './resolvers';

function renderIcon(icon: ReactNode | string | undefined, color: string, size: number) {
  if (!icon) return null;
  if (typeof icon === 'string') {
    return <AppIcon name={icon} size={size} color={color} />;
  }
  return icon;
}

export function SarhButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  shape = 'rounded',
  disabled = false,
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  accessibilityLabel,
  style,
  testID,
}: SarhButtonProps) {
  const { scheme } = useTheme();
  const blocked = disabled || loading;
  const metrics = buttonMetrics.size[size];
  const filled = variant === 'primary' || variant === 'danger' || variant === 'inverse';

  function visualState(pressed: boolean): Exclude<SarhButtonState, 'loading'> {
    if (disabled) return 'disabled';
    if (pressed && !loading) return 'pressed';
    return 'default';
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={blocked ? undefined : onPress}
      style={({ pressed }) => {
        const palette = resolveSarhButtonColorsForScheme(scheme, variant, visualState(pressed));
        return [
          getRtlRow(),
          filled && !disabled ? buttonMetrics.elevation : null,
          {
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: metrics.minHeight,
            paddingHorizontal: metrics.paddingHorizontal,
            gap: buttonMetrics.gap,
            borderRadius: shape === 'pill' ? buttonMetrics.pillRadius : buttonMetrics.radius,
            borderWidth: variant === 'ghost' ? 0 : buttonMetrics.borderWidth,
            backgroundColor: palette.backgroundColor,
            borderColor: palette.borderColor,
            opacity: disabled ? motion.opacity.disabled : 1,
            transform: [{ scale: pressed && !blocked ? motion.pressScale : 1 }],
            shadowColor: colors.background,
            width: fullWidth ? '100%' : undefined,
            flexShrink: fullWidth ? 1 : 0,
            flexWrap: 'nowrap',
          },
          style,
        ];
      }}
    >
      {({ pressed }) => {
        const palette = resolveSarhButtonColorsForScheme(scheme, variant, visualState(pressed));
        return (
          <>
            {loading ? (
              <ActivityIndicator color={palette.contentColor} />
            ) : (
              renderIcon(leftIcon, palette.contentColor, metrics.icon)
            )}
            <AppText
              variant={metrics.typeRole}
              color="textPrimary"
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{ color: palette.contentColor, flexShrink: 0 }}
            >
              {title}
            </AppText>
            {loading ? null : renderIcon(rightIcon, palette.contentColor, metrics.icon)}
          </>
        );
      }}
    </Pressable>
  );
}

export default SarhButton;
