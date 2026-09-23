import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText, SarhSurface } from '@/design-system/components';
import { colors, elevation, motion, radius, space } from '@/design-system';
import { dismissToast, getToastState, subscribeToast, type ToastType } from '@/lib/toast';
import { getRtlRow } from '@/lib/rtl';

const ICONS: Record<ToastType, string> = {
  success: 'checkmark-circle',
  error: 'close-circle',
  warning: 'alert-circle',
  info: 'information-circle',
};

const TONE: Record<ToastType, { border: string; icon: string }> = {
  success: { border: colors.success, icon: colors.success },
  error: { border: colors.danger, icon: colors.danger },
  warning: { border: colors.warning, icon: colors.warning },
  info: { border: colors.primary, icon: colors.primary },
};

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [tick, setTick] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;

  useEffect(() => subscribeToast(() => setTick((n) => n + 1)), []);

  const state = getToastState();
  void tick;

  useEffect(() => {
    if (!state) return;
    opacity.setValue(0);
    translateY.setValue(-16);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: motion.duration.press, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, ...motion.spring.snappy }),
    ]).start();
  }, [state?.id, opacity, translateY, state]);

  if (!state) return null;

  const tone = TONE[state.type];

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + space[8] }]}>
      <Animated.View style={{ opacity, transform: [{ translateY }] }}>
        <Pressable
          onPress={dismissToast}
          accessibilityRole="alert"
          style={getRtlRow()}
        >
          <SarhSurface tone="surfaceElevated" style={[styles.toast, { borderColor: `${tone.border}88` }, getRtlRow()]}>
            <AppIcon name={ICONS[state.type]} size={20} color={tone.icon} />
            <AppText variant="bodySmall" color="textPrimary" style={styles.message}>
              {state.message}
            </AppText>
          </SarhSurface>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: space[16],
    right: space[16],
    zIndex: 9999,
    alignItems: 'center',
  },
  toast: {
    alignItems: 'center',
    gap: space[8],
    paddingHorizontal: space[16],
    paddingVertical: space[12],
    borderRadius: radius[16],
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 420,
    width: '100%',
    ...elevation.raised,
  },
  message: {
    flex: 1,
  },
});
