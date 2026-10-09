import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/design-system/components';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow } from '@/lib/rtl';
import {
  dialogLayout,
  getDialogState,
  orderDialogButtons,
  resolveDialog,
  subscribeDialog,
  type DialogButton,
  type DialogRequest,
} from '@/lib/confirmDialog';

/**
 * Centered iOS-style dialog for `showAlert` / `presentConfirm` / `alertMessage`.
 * Fades + scales in (RN Animated, native driver). Two buttons sit side by side,
 * three or more stack; destructive text is muted red; cancel is semibold.
 */
export function ConfirmDialogHost() {
  const { colors } = useTheme();
  const [, setTick] = useState(0);
  useEffect(() => subscribeDialog(() => setTick((n) => n + 1)), []);
  const live = getDialogState();
  const lastRef = useRef<DialogRequest | null>(live);
  if (live) lastRef.current = live;
  const state = live ?? lastRef.current;
  const [anim] = useState(() => new Animated.Value(0));
  const [mounted, setMounted] = useState(!!live);
  const visible = !!live;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(anim, {
        toValue: 0,
        duration: 150,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [anim, mounted, visible, live?.id]);

  if (!mounted || !state) return null;

  const buttons = orderDialogButtons(state.buttons);
  const layout = dialogLayout(buttons);
  const hasCancel = buttons.some((b) => b.style === 'cancel');
  const dismiss = () => {
    if (!live) return;
    if (hasCancel || live.options?.cancelable) {
      const cancel = buttons.find((b) => b.style === 'cancel') ?? null;
      resolveDialog(live.id, cancel);
    }
  };
  const press = (b: DialogButton) => {
    if (live) resolveDialog(live.id, b);
  };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={dismiss}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgOverlay, opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="إغلاق" />
      </Animated.View>
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          testID="confirm-dialog"
          accessibilityViewIsModal
          style={[
            styles.card,
            {
              backgroundColor: colors.bgSurface,
              borderColor: colors.borderSoft,
              opacity: anim,
              transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) }],
            },
          ]}
        >
          <View style={styles.texts}>
            <AppText variant="label" color="textPrimary" align="center" accessibilityRole="header">
              {state.title}
            </AppText>
            {state.message ? (
              <AppText variant="bodySmall" color="textSecondary" align="center">
                {state.message}
              </AppText>
            ) : null}
          </View>
          <View
            style={[
              layout === 'row' ? [styles.row, getRtlRow()] : styles.column,
              { borderColor: colors.borderSoft },
            ]}
          >
            {buttons.map((b, i) => (
              <Pressable
                key={`${b.text}-${i}`}
                testID={`confirm-dialog-button-${i}`}
                accessibilityRole="button"
                accessibilityLabel={b.text}
                onPress={() => press(b)}
                style={({ pressed }) => [
                  styles.button,
                  layout === 'row' ? styles.buttonRow : null,
                  i > 0
                    ? layout === 'row'
                      ? { borderStartWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSoft }
                      : { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSoft }
                    : null,
                  pressed && { backgroundColor: colors.bgElevated },
                ]}
              >
                <AppText
                  variant={b.style === 'cancel' ? 'label' : 'body'}
                  align="center"
                  numberOfLines={1}
                  style={{ color: b.style === 'destructive' ? colors.danger : colors.textPrimary }}
                >
                  {b.text}
                </AppText>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  card: {
    width: '100%',
    maxWidth: 300,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  texts: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 16, gap: 6 },
  row: { borderTopWidth: StyleSheet.hairlineWidth },
  column: { borderTopWidth: StyleSheet.hairlineWidth },
  button: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  buttonRow: { flex: 1 },
});

export default ConfirmDialogHost;
