import { useTheme } from '@/hooks/useTheme';
import { sarh } from '@/constants/sarhTokens';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

type SarhPatternBackgroundProps = {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * Subtle logo-inspired curves — background layer only (not on cards).
 */
export function SarhPatternBackground({ style, children }: SarhPatternBackgroundProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.bgDeep }, style]}>
      {isDark ? (
        <Svg
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          width="100%"
          height="100%"
          viewBox="0 0 400 800"
          preserveAspectRatio="xMidYMid slice"
        >
          <Path
            d="M-20 120 Q 120 40, 260 100 T 420 80"
            stroke={sarh.color.pattern}
            strokeWidth={1.2}
            fill="none"
            opacity={sarh.pattern.opacity}
          />
          <Path
            d="M-40 280 Q 100 200, 220 260 T 440 220"
            stroke={sarh.color.pattern}
            strokeWidth={1}
            fill="none"
            opacity={sarh.pattern.opacity * 0.85}
          />
          <Path
            d="M0 440 Q 140 360, 280 420 T 400 400"
            stroke={sarh.color.pattern}
            strokeWidth={1.4}
            fill="none"
            opacity={sarh.pattern.opacity * 0.7}
          />
          <Path
            d="M-30 600 Q 160 520, 300 580 T 420 560"
            stroke={sarh.color.pattern}
            strokeWidth={1}
            fill="none"
            opacity={sarh.pattern.opacity * 0.55}
          />
          <Path
            d="M80 0 Q 200 120, 120 240 T 200 400 T 100 560 T 180 800"
            stroke={sarh.color.pattern}
            strokeWidth={0.8}
            fill="none"
            opacity={sarh.pattern.opacity * 0.45}
          />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
});

export default SarhPatternBackground;
