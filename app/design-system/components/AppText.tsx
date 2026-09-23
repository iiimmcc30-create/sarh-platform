import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import {
  resolveAppTextStyle,
  type AppTextAlign,
  type AppTextColor,
  type AppTextVariant,
} from './resolvers';
import type { TextProps } from 'react-native';

export type AppTextProps = TextProps & {
  variant?: AppTextVariant;
  color?: AppTextColor;
  align?: AppTextAlign;
};

export {
  APP_TEXT_COLOR,
  resolveAppTextStyle,
} from './resolvers';
export type { AppTextAlign, AppTextColor, AppTextVariant } from './resolvers';

/**
 * Official Sarh text primitive. Variants own size + real Tajawal weight.
 * Do not pass fontSize unless escaping the scale for a one-off.
 * Android face/weight safety is applied globally by `applyAppFonts`.
 */
export function AppText({
  variant = 'body',
  color = 'textPrimary',
  align = 'auto',
  allowFontScaling = true,
  style,
  ...rest
}: AppTextProps) {
  const { colors } = useTheme();
  const themeColor = {
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textMuted: colors.textMuted,
    primary: colors.electric,
    danger: colors.danger,
    warning: colors.warning,
    success: colors.success,
  }[color];

  return (
    <Text
      allowFontScaling={allowFontScaling}
      style={[
        resolveAppTextStyle({ variant, color, align }),
        { color: themeColor },
        style as StyleProp<TextStyle>,
      ]}
      {...rest}
    />
  );
}

export default AppText;
