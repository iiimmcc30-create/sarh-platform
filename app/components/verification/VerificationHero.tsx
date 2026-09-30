import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { verifiedBadgeColor } from '@/lib/verifiedBadge';
import { TierBadgeMark } from './TierBadgeMark';

type Props = {
  tier: 'blue' | 'gold';
  /** Illustration width (the badge scales with it). */
  width?: number;
};

/** Decorative dashes (x1, y1, x2, y2) and dots (cx, cy, r) around the badge. */
const DASHES: readonly [number, number, number, number][] = [
  [58, 30, 72, 14],
  [96, 12, 104, 2],
  [182, 22, 196, 10],
  [206, 52, 224, 42],
  [30, 70, 44, 62],
  [192, 96, 206, 104],
];
const DOTS: readonly [number, number, number][] = [
  [40, 38, 2.5],
  [128, 8, 2],
  [222, 78, 2.5],
  [22, 100, 2],
  [60, 112, 2.5],
  [170, 116, 2],
];

/**
 * Verification hero: a large tier badge with a few flat dashes / dots in the
 * same tier colour. No gradients, no glow — switches colour with the tab.
 */
export function VerificationHero({ tier, width = 240 }: Props) {
  const color = verifiedBadgeColor(tier);
  const height = width / 2;
  const badge = Math.round(width * 0.3);
  return (
    <View
      style={[styles.wrap, { width, height }]}
      accessibilityRole="image"
      accessibilityLabel={tier === 'gold' ? 'الشارة الذهبية' : 'الشارة الزرقاء'}
    >
      <Svg width={width} height={height} viewBox="0 0 240 120" style={StyleSheet.absoluteFill}>
        {DASHES.map(([x1, y1, x2, y2]) => (
          <Line
            key={`${x1}-${y1}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.85}
          />
        ))}
        {DOTS.map(([cx, cy, r]) => (
          <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={color} opacity={0.7} />
        ))}
      </Svg>
      <TierBadgeMark tier={tier} size={badge} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
});

export default VerificationHero;
