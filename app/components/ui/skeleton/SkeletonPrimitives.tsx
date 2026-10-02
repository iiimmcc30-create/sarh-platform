/**
 * Skeleton primitives — the in-project skeleton kit (no new dependency).
 *
 * Performance model:
 * - ONE shared Animated.Value drives every skeleton on screen (ref-counted loop,
 *   started on the first mount and stopped when the last skeleton unmounts).
 * - Only `opacity` is animated, with `useNativeDriver: true`, so the pulse runs on
 *   the UI thread and never touches the JS thread after start.
 * - Bones are plain Views; only the `SkeletonPulse` wrapper (one per card/row
 *   group) is an Animated.View.
 * - Reduce Motion: the pulse is skipped and bones stay static.
 *
 * RTL: everything is laid out with logical rows (`getRtlRow()`) and
 * `alignItems: 'flex-start'` (= inline start, right in Arabic). No left/right.
 */
import { useEffect, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import {
  SKELETON_A11Y_LABEL,
  SKELETON_PULSE_HALF_MS,
  SKELETON_PULSE_MIN_OPACITY,
  SKELETON_TEXT_RADIUS,
  skeletonColor,
  skeletonTextBarHeight,
} from './skeletonTokens';

// ---------------------------------------------------------------------------
// Shared pulse driver
// ---------------------------------------------------------------------------

const pulseValue = new Animated.Value(0);
const pulseOpacity = pulseValue.interpolate({
  inputRange: [0, 1],
  outputRange: [1, SKELETON_PULSE_MIN_OPACITY],
});
let pulseUsers = 0;
let pulseLoop: Animated.CompositeAnimation | null = null;
let reduceMotion = false;

AccessibilityInfo.isReduceMotionEnabled?.()
  .then((value) => {
    reduceMotion = value;
    if (value) stopPulse();
  })
  .catch(() => undefined);

function startPulse() {
  if (pulseLoop || reduceMotion) return;
  pulseLoop = Animated.loop(
    Animated.sequence([
      Animated.timing(pulseValue, {
        toValue: 1,
        duration: SKELETON_PULSE_HALF_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(pulseValue, {
        toValue: 0,
        duration: SKELETON_PULSE_HALF_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]),
  );
  pulseLoop.start();
}

function stopPulse() {
  pulseLoop?.stop();
  pulseLoop = null;
  pulseValue.setValue(0);
}

function useSharedPulse() {
  useEffect(() => {
    pulseUsers += 1;
    if (pulseUsers === 1) startPulse();
    return () => {
      pulseUsers = Math.max(0, pulseUsers - 1);
      if (pulseUsers === 0) stopPulse();
    };
  }, []);
  return pulseOpacity;
}

// ---------------------------------------------------------------------------
// Wrappers
// ---------------------------------------------------------------------------

type PulseProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Animated group: wraps the bones of one card/row so they pulse together. */
export function SkeletonPulse({ children, style }: PulseProps) {
  const opacity = useSharedPulse();
  return (
    <Animated.View
      style={[style, { opacity }]}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {children}
    </Animated.View>
  );
}

type RegionProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * One accessible loading region per skeleton list/section: screen readers hear
 * "جاري التحميل" once instead of every bone.
 */
export function SkeletonRegion({ children, style, testID }: RegionProps) {
  return (
    <View
      testID={testID ?? 'skeleton-region'}
      style={style}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={SKELETON_A11Y_LABEL}
      accessibilityState={{ busy: true }}
    >
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bones
// ---------------------------------------------------------------------------

type BoxProps = {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** A plain grey block. Put it inside a `SkeletonPulse` to animate it. */
export function SkeletonBox({ width = '100%', height = 12, radius = SKELETON_TEXT_RADIUS, style }: BoxProps) {
  const { scheme } = useTheme();
  return (
    <View
      style={[
        { width, height, borderRadius: radius, backgroundColor: skeletonColor(scheme) },
        style,
      ]}
    />
  );
}

type CircleProps = {
  size: number;
  style?: StyleProp<ViewStyle>;
};

export function SkeletonCircle({ size, style }: CircleProps) {
  return <SkeletonBox width={size} height={size} radius={size / 2} style={[{ flexShrink: 0 }, style]} />;
}

type ImageProps = {
  width?: DimensionValue;
  height?: DimensionValue;
  aspectRatio?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** Image / thumbnail placeholder; keep the real image's size, ratio and radius. */
export function SkeletonImage({ width = '100%', height, aspectRatio, radius = 0, style }: ImageProps) {
  return (
    <SkeletonBox
      width={width}
      height={height}
      radius={radius}
      style={[{ flexShrink: 0 }, aspectRatio ? { aspectRatio } : null, style]}
    />
  );
}

type TextProps = {
  /** Real text metrics — the line box keeps the real lineHeight. */
  fontSize: number;
  lineHeight: number;
  /** Number of lines the real text renders (use the real numberOfLines). */
  lines?: number;
  /** Width of each line; the last entry repeats. Defaults: full lines, last 60%. */
  widths?: DimensionValue[];
  /** Inline alignment of the bars (`center` for centred labels such as stats). */
  align?: 'start' | 'center';
  style?: StyleProp<ViewStyle>;
};

/**
 * Text placeholder. Each line occupies exactly `lineHeight` (so the block is as
 * tall as the real text) with a glyph-height bar centred inside it, starting at
 * the inline start edge (right in Arabic).
 */
export function SkeletonText({ fontSize, lineHeight, lines = 1, widths, align = 'start', style }: TextProps) {
  const bar = skeletonTextBarHeight(fontSize, lineHeight);
  const resolved: DimensionValue[] =
    widths && widths.length > 0
      ? widths
      : lines === 1
        ? ['70%']
        : [...Array.from({ length: lines - 1 }, () => '100%' as DimensionValue), '60%'];
  return (
    <View style={[{ alignSelf: 'stretch' }, style]}>
      {Array.from({ length: lines }, (_, i) => (
        <View
          key={i}
          style={{
            height: lineHeight,
            justifyContent: 'center',
            alignItems: align === 'center' ? 'center' : 'flex-start',
          }}
        >
          <SkeletonBox width={resolved[Math.min(i, resolved.length - 1)]} height={bar} />
        </View>
      ))}
    </View>
  );
}

/** Repeats a skeleton row `count` times (first load fills the visible area). */
export function SkeletonRepeat({
  count,
  render,
  separator,
}: {
  count: number;
  render: (index: number) => ReactNode;
  separator?: ReactNode;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <View key={i}>
          {i > 0 && separator ? separator : null}
          {render(i)}
        </View>
      ))}
    </>
  );
}
