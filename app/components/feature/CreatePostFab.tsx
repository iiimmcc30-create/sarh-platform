// SAFAT — Floating Action Button for creating posts.
// mode="fixed"     → X/Threads-style: anchored bottom-right, press-scale animation.
// mode="draggable" → draggable anywhere on screen, position persisted (default).
import { AppIcon } from '@/components/ui/FlaticonIcon';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { inlineEnd } from '@/lib/rtl';

const FAB_SIZE = 56;
const STORAGE_KEY = 'safat_create_fab_offset_v2';
const DRAG_THRESHOLD = 6;
const TAB_BAR_CLEARANCE = 88;

interface CreatePostFabProps {
  onPress?: () => void;
  bottomOffset?: number;
  /** "fixed" = X/Threads-style anchored, no drag. "draggable" = movable (default). */
  mode?: 'fixed' | 'draggable';
}

interface Offset {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampOffset(x: number, y: number, bottomOffset: number, insets: { top: number; bottom: number }) {
  const { width, height } = Dimensions.get('window');
  const tabBarHeight = 72;
  const maxLeft = -(width - FAB_SIZE - spacing.lg * 2);
  const maxUp = -(height - FAB_SIZE - insets.top - insets.bottom - bottomOffset - tabBarHeight);

  return {
    x: clamp(x, maxLeft, spacing.lg),
    y: clamp(y, maxUp, spacing.lg),
  };
}

export function CreatePostFab({ onPress, bottomOffset = TAB_BAR_CLEARANCE, mode = 'draggable' }: CreatePostFabProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const fabColors = useMemo(
    () => ({
      backgroundColor: '#60A5FA',
      shadowColor: '#2563EB',
    }),
    [],
  );
  const dragMoved = useRef(false);
  const dragStart = useRef<Offset>({ x: 0, y: 0 });
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  const offset = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!saved || !mounted) return;
        const parsed = JSON.parse(saved) as Partial<Offset>;
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          const next = clampOffset(parsed.x, parsed.y, bottomOffset, insets);
          offset.setValue(next);
        }
      } catch {
        // keep default corner position
      }
    })();

    return () => {
      mounted = false;
    };
  }, [bottomOffset, insets, offset]);

  const persistOffset = async (point: Offset) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(point));
    } catch {
      // ignore persistence errors
    }
  };

  const handleFixedPress = useCallback(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, speed: 40, bounciness: 0 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 6 }),
    ]).start();
    if (onPress) {
      onPress();
    } else {
      router.push('/create/post');
    }
  }, [scale, onPress, router]);

  // ── Fixed mode (X/Threads style) ─────────────────────────────────────
  if (mode === 'fixed') {
    return (
      <Animated.View
        style={[
          styles.fab,
          fabColors,
          inlineEnd(spacing.lg),
          { bottom: insets.bottom + bottomOffset, transform: [{ scale }] },
        ]}
      >
        <Pressable
          style={styles.iconSlot}
          onPress={handleFixedPress}
          accessibilityRole="button"
          accessibilityLabel="إنشاء منشور"
          android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: true, radius: FAB_SIZE / 2 }}
        >
          <AppIcon name="plus" size={24} color="#fff" style={styles.icon} />
        </Pressable>
      </Animated.View>
    );
  }

  // ── Draggable mode (default) ──────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > DRAG_THRESHOLD || Math.abs(gesture.dy) > DRAG_THRESHOLD,
      onPanResponderGrant: () => {
        dragMoved.current = false;
        const current = offset as unknown as { x: { _value: number }; y: { _value: number } };
        dragStart.current = { x: current.x._value, y: current.y._value };
      },
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dx) > DRAG_THRESHOLD || Math.abs(gesture.dy) > DRAG_THRESHOLD) {
          dragMoved.current = true;
        }

        offset.setValue(
          clampOffset(
            dragStart.current.x + gesture.dx,
            dragStart.current.y + gesture.dy,
            bottomOffset,
            insets,
          ),
        );
      },
      onPanResponderRelease: (_, gesture) => {
        const next = clampOffset(
          dragStart.current.x + gesture.dx,
          dragStart.current.y + gesture.dy,
          bottomOffset,
          insets,
        );
        offset.setValue(next);
        void persistOffset(next);

        if (!dragMoved.current) {
          if (onPressRef.current) {
            onPressRef.current();
          } else {
            router.push('/create/post');
          }
        }
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  return (
    <Animated.View
      accessibilityRole="button"
      accessibilityLabel="إنشاء منشور"
      accessibilityHint="اسحب لتحريك الزر أو اضغط لفتح إنشاء منشور"
      style={[
        styles.fab,
        fabColors,
        inlineEnd(spacing.lg),
        { bottom: insets.bottom + bottomOffset },
        {
          transform: offset.getTranslateTransform(),
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={styles.iconSlot} pointerEvents="none">
        <AppIcon name="plus" size={24} color="#fff" style={styles.icon} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    elevation: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
  },
  iconSlot: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    transform: [{ translateX: 1 }, { translateY: 1 }],
  },
});
