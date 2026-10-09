import {
  HEADER_TAB_INDICATOR_THICKNESS,
  tabIndicatorInterpolation,
  type TabIndicatorOptions,
  type TabLayout,
} from '@/lib/tabPager';
import { useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

/**
 * The bar is laid out at a fixed width and sized with scaleX, so the whole
 * animation is transform-only and runs on the native driver (a `width`
 * interpolation cannot, and forces a JS layout pass every frame).
 */
const BASE_WIDTH = 100;

type Props = TabIndicatorOptions & {
  /** Pager progress (0 .. count - 1) from useSwipeTabPager: follows the drag. */
  progress: Animated.AnimatedInterpolation<number> | Animated.Value;
  layouts: readonly (TabLayout | undefined)[];
  count: number;
  color: string;
  thickness?: number;
  radius?: number;
};

/**
 * One sliding indicator for a whole tab row (render it as the LAST child of
 * the row that holds the measured tabs). It sits under tab `i` at progress
 * `i` and slides / resizes between measured tabs while the pager is dragged.
 *
 * The track spans the row (left: 0 / right: 0, so RTL insets cannot flip it)
 * and lays out LTR, so translateX is the physical x reported by onLayout on
 * native and web alike.
 */
export function SwipeTabIndicator({
  progress,
  layouts,
  count,
  color,
  thickness = HEADER_TAB_INDICATOR_THICKNESS,
  radius = 999,
  fixedWidth,
  inset,
}: Props) {
  const interp = useMemo(
    () => tabIndicatorInterpolation(layouts, count, { fixedWidth, inset }),
    [count, fixedWidth, inset, layouts],
  );
  const animated = useMemo(() => {
    if (!interp) return null;
    // scaleX pivots on the bar's centre: shift the centre to x + w / 2.
    return {
      translateX: progress.interpolate({
        inputRange: interp.inputRange,
        outputRange: interp.translateX.map((x, i) => x + interp.width[i] / 2 - BASE_WIDTH / 2),
        extrapolate: 'clamp',
      }),
      scaleX: progress.interpolate({
        inputRange: interp.inputRange,
        outputRange: interp.width.map((w) => w / BASE_WIDTH),
        extrapolate: 'clamp',
      }),
    };
  }, [interp, progress]);

  if (!interp || !animated) return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.track, { top: interp.top - thickness, height: thickness }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={{
          // Physical left anchor: RN-web ignores the track's `direction: 'ltr'` in an RTL page.
          position: 'absolute',
          left: 0,
          top: 0,
          width: BASE_WIDTH,
          height: thickness,
          borderRadius: radius,
          backgroundColor: color,
          transform: [{ translateX: animated.translateX }, { scaleX: animated.scaleX }],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    direction: 'ltr',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
});
