import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { useTheme } from '@/hooks/useTheme';

const COLS = 5;
const ROWS = 8;
const TILE = 72;
const VIEW_W = COLS * TILE;
const VIEW_H = ROWS * TILE;

/**
 * Quiet repeating chat doodles for the thread pane only.
 * Original Sarh marks — not a third-party wallpaper copy.
 */
function ChatDoodleTile({
  x,
  y,
  color,
  variant,
}: {
  x: number;
  y: number;
  color: string;
  variant: number;
}) {
  const kind = variant % 4;
  if (kind === 0) {
    return (
      <Path
        d={`M${x + 10} ${y + 16} h20 a5 5 0 0 1 5 5 v9 a5 5 0 0 1 -5 5 h-12 l-5 5 v-5 h-3 a5 5 0 0 1 -5 -5 v-9 a5 5 0 0 1 5 -5 z`}
        fill="none"
        stroke={color}
        strokeWidth={1.15}
        strokeLinejoin="round"
      />
    );
  }
  if (kind === 1) {
    return (
      <Path
        d={`M${x + 18} ${y + 14} l16 8 -16 8 4 -8 z`}
        fill="none"
        stroke={color}
        strokeWidth={1.15}
        strokeLinejoin="round"
      />
    );
  }
  if (kind === 2) {
    return (
      <G>
        <Circle cx={x + 20} cy={y + 26} r={1.5} fill={color} />
        <Circle cx={x + 28} cy={y + 26} r={1.5} fill={color} />
        <Circle cx={x + 36} cy={y + 26} r={1.5} fill={color} />
      </G>
    );
  }
  return (
    <Path
      d={`M${x + 22} ${y + 12} v22 a4 4 0 0 0 8 0 v-16 a6 6 0 0 1 6 -6`}
      fill="none"
      stroke={color}
      strokeWidth={1.15}
      strokeLinecap="round"
    />
  );
}

export const ChatThreadWallpaper = memo(function ChatThreadWallpaper() {
  const { colors, isDark } = useTheme();
  const ink = isDark ? colors.borderStrong : colors.borderMid;
  const opacity = isDark ? 0.055 : 0.1;
  const tiles: ReactNode[] = [];

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const stagger = row % 2 === 1 ? TILE / 3 : 0;
      tiles.push(
        <ChatDoodleTile
          key={`${row}-${col}`}
          x={col * TILE + stagger}
          y={row * TILE}
          color={ink}
          variant={row * COLS + col + row}
        />,
      );
    }
  }

  return (
    <View
      pointerEvents="none"
      style={[styles.fill, { backgroundColor: isDark ? colors.bgDeep : colors.bgField }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ opacity }}
      >
        {tiles}
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default ChatThreadWallpaper;
