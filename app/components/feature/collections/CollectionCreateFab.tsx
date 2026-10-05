import { useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ds } from '@/constants/designSystem';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { inlineEnd } from '@/lib/rtl';

const FAB_SIZE = 56;
/** Same clearance as CreatePostFab (tab bar + 24). */
const TAB_BAR_CLEARANCE = ds.tabBar.height + 24;

type Props = {
  onPress: () => void;
  accessibilityLabel?: string;
  bottomOffset?: number;
};

/**
 * Floating create button — same size, placement and press-scale as CreatePostFab
 * in fixed mode, but primary green (Sarh) and routing left to the caller.
 */
export function CollectionCreateFab({
  onPress,
  accessibilityLabel = 'أنشئ قائمتك',
  bottomOffset = TAB_BAR_CLEARANCE,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const fabColors = useMemo(
    () => ({
      backgroundColor: colors.electric,
      shadowColor: colors.electricBright,
    }),
    [colors.electric, colors.electricBright],
  );

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { bottom: insets.bottom + bottomOffset, transform: [{ scale }] },
        inlineEnd(spacing.lg),
      ]}
    >
      <Pressable
        onPressIn={() =>
          Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 40 }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start()
        }
        onPress={onPress}
        style={[styles.fab, fabColors]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <AppIcon name="plus" size={24} color="#fff" style={styles.icon} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 20,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  icon: { marginTop: 1 },
});
