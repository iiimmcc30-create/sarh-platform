import { tabIndicatorInterpolation, type TabIndicatorOptions, type TabLayout } from '@/lib/tabPager';
import { useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

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
  thickness = 2,
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
    return {
      translateX: progress.interpolate({
        inputRange: interp.inputRange,
        outputRange: interp.translateX,
        extrapolate: 'clamp',
      }),
      width: progress.interpolate({
        inputRange: interp.inputRange,
        outputRange: interp.width,
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
          width: animated.width,
          height: thickness,
          borderRadius: radius,
          backgroundColor: color,
          transform: [{ translateX: animated.translateX }],
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
