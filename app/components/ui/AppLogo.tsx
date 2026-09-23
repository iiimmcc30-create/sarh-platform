import { Image, type ImageStyle } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { APP_LOGO } from '@/constants/branding';
import { radius, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

type AppLogoProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** @deprecated Prefer shape="square". Ring no longer forces a circle. */
  showRing?: boolean;
  /**
   * Sarh mark is square. Default is square — never crop to a circle.
   * `circle` kept only for rare legacy call sites that explicitly need it.
   */
  shape?: 'square' | 'circle';
};

export function AppLogo({
  size = 88,
  style,
  showRing = true,
  shape = 'square',
}: AppLogoProps) {
  const { styles, shadow } = useThemedStyles((theme) => ({
    styles: createStyles(theme.colors),
    shadow: theme.shadow,
  }));

  const corner =
    shape === 'circle' ? size / 2 : Math.min(radius.lg, Math.round(size * 0.18));
  const inner = Math.round(size * (showRing ? 0.82 : 1));
  const innerCorner =
    shape === 'circle'
      ? inner / 2
      : Math.min(radius.md, Math.round(inner * 0.16));

  if (!showRing) {
    return (
      <Image
        source={APP_LOGO}
        style={[
          styles.logo,
          {
            width: size,
            height: size,
            borderRadius: corner,
          } as ImageStyle,
          style as StyleProp<ImageStyle>,
        ]}
        contentFit="contain"
      />
    );
  }

  return (
    <View
      style={[
        styles.ring,
        shadow.glow,
        {
          width: size,
          height: size,
          borderRadius: corner,
        },
        style,
      ]}
    >
      <Image
        source={APP_LOGO}
        style={{
          width: inner,
          height: inner,
          borderRadius: innerCorner,
        }}
        contentFit="contain"
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    ring: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      overflow: 'hidden',
    },
    logo: {
      overflow: 'hidden',
      backgroundColor: 'transparent',
    },
  });
}
