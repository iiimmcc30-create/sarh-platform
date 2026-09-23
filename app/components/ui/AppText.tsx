import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { resolveAppFontFace, toLoadedFontStyle } from '@/constants/fonts';
import { getRtlText } from '@/lib/rtl';

export type AppTextProps = TextProps;

function withOfficialFont(style: StyleProp<TextStyle> | undefined): StyleProp<TextStyle> {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const face = resolveAppFontFace(flat?.fontWeight, flat?.fontFamily);
  if (face.fontFamily === 'monospace') return style;
  return [style, toLoadedFontStyle(face)];
}

/**
 * Default text primitive. Relies on global I18nManager RTL — no textAlign,
 * no LTR island, no physical-edge alignment. Use this in all new screens.
 * Applies weight-aware Tajawal (does not force Bold). Prefer
 * `@/design-system` AppText + variants for new UI.
 */
export function AppText({ style, ...rest }: AppTextProps) {
  return (
    <Text
      style={[getRtlText(), withOfficialFont(style)]}
      {...rest}
    />
  );
}

export default AppText;
