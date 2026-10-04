import { memo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { DEFAULT_ICON_SIZE, ICON_STROKE } from '@/lib/lucideIconMap';

/**
 * Views glyph: four vertical bars (X-style analytics icon), drawn on the same
 * 24×24 grid, stroke and round caps as the Lucide icons so it matches them in
 * size and weight. Bars (inline order): medium, tallest, short, tall.
 */
export const VIEWS_BARS_PATHS = ['M5 20v-9', 'M10 20V4', 'M14.5 20v-6', 'M19 20V8.5'] as const;

type Props = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

function ViewsBarsIconComponent({
  size = DEFAULT_ICON_SIZE,
  color = '#000',
  strokeWidth = ICON_STROKE,
  style,
}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      {VIEWS_BARS_PATHS.map((d) => (
        <Path key={d} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      ))}
    </Svg>
  );
}

export const ViewsBarsIcon = memo(ViewsBarsIconComponent);
