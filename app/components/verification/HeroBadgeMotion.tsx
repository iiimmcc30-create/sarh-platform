import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { verifiedBadgeColor } from '@/lib/verifiedBadge';
import { heroBadgeShouldAnimate } from '@/lib/heroBadgeMotion';

type Tier = 'blue' | 'gold';

type Props = {
  tier: Tier;
  size: number;
  children: ReactNode;
};

/** OS reduced-motion, including the web `prefers-reduced-motion` media query. */
function useReduceMotion(): boolean | null {
  const [value, setValue] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((next) => {
        if (alive) setValue(Boolean(next));
      })
      .catch(() => {
        if (alive) setValue(false);
      });
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (next) => {
      setValue(Boolean(next));
    });
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return value;
}

/**
 * Premium motion for the verification-page hero seal only: a slow breathe,
 * a soft halo, a slight tilt, and a glint that crosses the badge then rests.
 * Transform and opacity only, so Reanimated runs this on the UI thread
 * (the web export uses the same worklets). Stops when the screen blurs and
 * stays still when the OS asks for reduced motion.
 */
export function HeroBadgeMotion({ tier, size, children }: Props) {
  const focused = useIsFocused();
  const reduceMotion = useReduceMotion();
  const animate = heroBadgeShouldAnimate(focused, reduceMotion);
  const color = verifiedBadgeColor(tier);

  const pulse = useSharedValue(0);
  const glint = useSharedValue(-1);
  const tilt = useSharedValue(0);

  useEffect(() => {
    if (!animate) {
      cancelAnimation(pulse);
      cancelAnimation(glint);
      cancelAnimation(tilt);
      pulse.value = 0;
      glint.value = -1;
      tilt.value = 0;
      return;
    }

    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
    // Sweep, then hold off-badge so the glint is occasional rather than constant.
    glint.value = withRepeat(
      withSequence(
        withTiming(-1, { duration: 0 }),
        withDelay(2400, withTiming(1, { duration: 980, easing: Easing.inOut(Easing.cubic) })),
        withTiming(1, { duration: 1700 }),
      ),
      -1,
      false,
    );
    tilt.value = withRepeat(
      withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(pulse);
      cancelAnimation(glint);
      cancelAnimation(tilt);
    };
  }, [animate, glint, pulse, tilt]);

  const motionStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 700 },
      { rotateX: `${tilt.value * -3.5}deg` },
      { rotateY: `${tilt.value * 7}deg` },
      { scale: 1 + pulse.value * 0.045 },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.28 + pulse.value * 0.42,
    transform: [{ scale: 1.12 + pulse.value * 0.16 }],
  }));

  const glintStyle = useAnimatedStyle(() => ({
    opacity: 0.85,
    transform: [{ translateX: glint.value * size * 1.45 }, { rotate: '22deg' }],
  }));

  if (!animate) return <>{children}</>;

  const band = Math.max(10, Math.round(size * 0.22));
  return (
    <View style={{ width: size, height: size }} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          glowStyle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
          },
        ]}
      />
      <Animated.View style={[{ width: size, height: size }, motionStyle]}>
        <View style={[styles.clip, { width: size, height: size, borderRadius: size / 2 }]}>
          {children}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.glint,
              glintStyle,
              {
                width: band,
                height: size * 2.4,
                top: -size * 0.7,
                backgroundColor: tier === 'gold' ? 'rgba(255, 244, 214, 0.55)' : 'rgba(255, 255, 255, 0.5)',
              },
            ]}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  clip: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glint: {
    position: 'absolute',
    left: 0,
  },
});

export default HeroBadgeMotion;
