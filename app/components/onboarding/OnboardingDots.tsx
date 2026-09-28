import { Animated, StyleSheet } from 'react-native';
import { onboardingStepLabel } from '@/constants/onboardingCopy';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { getRtlRow } from '@/lib/rtl';

type OnboardingDotsProps = {
  count: number;
  activeIndex: number;
  /** Logical pager progress (0 .. count - 1), RTL already resolved. */
  progress: Animated.AnimatedInterpolation<number>;
};

const DOT = 8;
const DOT_ACTIVE = 24;

/**
 * Progress dots driven by the live pager position: the active pill stretches
 * and brightens continuously while swiping (no discrete color jump). Dot 0 sits
 * at the inline start, matching the pager (next page comes from the inline end).
 */
export function OnboardingDots({ count, activeIndex, progress }: OnboardingDotsProps) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));

  return (
    <Animated.View
      style={styles.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={onboardingStepLabel(activeIndex, count)}
      accessibilityValue={{ min: 1, max: count, now: activeIndex + 1 }}
    >
      {Array.from({ length: count }).map((_, index) => {
        const inputRange = [index - 1, index, index + 1];
        const width = progress.interpolate({
          inputRange,
          outputRange: [DOT, DOT_ACTIVE, DOT],
          extrapolate: 'clamp',
        });
        const opacity = progress.interpolate({
          inputRange,
          outputRange: [0.3, 1, 0.3],
          extrapolate: 'clamp',
        });
        return <Animated.View key={index} style={[styles.dot, { width, opacity }]} />;
      })}
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      ...getRtlRow(),
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    dot: {
      height: DOT,
      borderRadius: DOT / 2,
      backgroundColor: colors.electric,
    },
  });
}
