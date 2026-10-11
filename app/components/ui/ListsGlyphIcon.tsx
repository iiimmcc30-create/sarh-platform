import { memo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { DEFAULT_ICON_SIZE, ICON_STROKE } from '@/lib/lucideIconMap';
import { LISTS_GLYPH_FRAME, LISTS_GLYPH_LINES } from '@/lib/listsGlyph';

type Props = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

function ListsGlyphIconComponent({
  size = DEFAULT_ICON_SIZE,
  color = '#000',
  strokeWidth = ICON_STROKE,
  style,
}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <Path
        d={LISTS_GLYPH_FRAME}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      {LISTS_GLYPH_LINES.map((d) => (
        <Path key={d} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      ))}
    </Svg>
  );
}

/** Rounded rectangle with horizontal lines — same stroke weight as the other icons. */
export const ListsGlyphIcon = memo(ListsGlyphIconComponent);
