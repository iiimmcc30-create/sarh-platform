import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '@/hooks/useTheme';
import {
  STORY_RING_GRADIENT,
  STORY_RING_SEEN_STROKE,
  avatarHairlineColor,
  storyRingStroke,
} from '@/constants/storyRing';

export type StoryRingState = 'unseen' | 'seen';

type StoryRingProps = {
  /** Outer ring diameter in px. */
  size: number;
  /** Diameter of the avatar drawn inside (unchanged by the ring). */
  avatarSize: number;
  state: StoryRingState;
  /** Colour of the gap between ring and avatar — the page background. Defaults to theme bgDeep. */
  gapColor?: string;
  /** Override the unseen stroke (defaults to ~4% of `size`, like the reference). */
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * Shared story ring (Stories row, profile header…). Drawn with react-native-svg:
 * - unseen: TikTok-style blue → green gradient stroke (same colours in Dark & Light),
 * - seen: thin theme-grey stroke,
 * then a gap in the page background and an X-style hairline at the avatar edge.
 */
export function StoryRing({
  size,
  avatarSize,
  state,
  gapColor,
  strokeWidth,
  style,
  children,
}: StoryRingProps) {
  const { colors, scheme } = useTheme();
  const gradientId = `storyRing${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const unseen = state === 'unseen';
  const stroke = unseen ? strokeWidth ?? storyRingStroke(size) : STORY_RING_SEEN_STROKE;
  const c = size / 2;
  const r = (size - stroke) / 2;
  // Gradient axis runs top-left → bottom-right through the ring's centre line.
  const d = r * Math.SQRT1_2;
  const hairline = StyleSheet.hairlineWidth;

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
        {unseen ? (
          <Defs>
            <LinearGradient
              id={gradientId}
              gradientUnits="userSpaceOnUse"
              x1={c - d}
              y1={c - d}
              x2={c + d}
              y2={c + d}
            >
              {STORY_RING_GRADIENT.map((s) => (
                <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
              ))}
            </LinearGradient>
          </Defs>
        ) : null}
        {/* Gap in the page background (also hides a cover photo behind the ring). */}
        <Circle cx={c} cy={c} r={size / 2 - stroke + 0.5} fill={gapColor ?? colors.bgDeep} />
        <Circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={unseen ? `url(#${gradientId})` : colors.borderSoft}
          strokeWidth={stroke}
        />
        {/* X-style hairline right at the avatar edge. */}
        <Circle
          cx={c}
          cy={c}
          r={avatarSize / 2 + hairline / 2}
          fill="none"
          stroke={avatarHairlineColor(scheme)}
          strokeWidth={hairline}
        />
      </Svg>
      {children}
    </View>
  );
}

export default StoryRing;
