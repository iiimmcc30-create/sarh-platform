import { AppIcon } from '@/components/ui/FlaticonIcon';
import { functional, motion } from '@/design-system';
import { useTheme } from '@/hooks/useTheme';
import {
  clampConversationSwipe,
  CONVERSATION_SWIPE_MAX,
  conversationDeleteStripAnchor,
  shouldCaptureConversationSwipe,
  shouldRevealConversationDelete,
  type ConversationAnchor,
} from '@/lib/conversationActions';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

type ConversationSwipeRowProps = {
  id: string;
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  onPress: () => void;
  onLongPress: (anchor: ConversationAnchor) => void;
  onDelete: () => void;
  disabled?: boolean;
  children: ReactNode;
};

export function ConversationSwipeRow({
  id,
  openId,
  onOpenChange,
  onPress,
  onLongPress,
  onDelete,
  disabled,
  children,
}: ConversationSwipeRowProps) {
  const { colors } = useTheme();
  const wrapRef = useRef<View>(null);
  const translateX = useRef(new Animated.Value(0)).current;
  const offsetRef = useRef(0);
  const startOffsetRef = useRef(0);
  const onOpenChangeRef = useRef(onOpenChange);
  const onDeleteRef = useRef(onDelete);
  const disabledRef = useRef(disabled);
  onOpenChangeRef.current = onOpenChange;
  onDeleteRef.current = onDelete;
  disabledRef.current = disabled;

  const snapTo = useCallback(
    (toValue: number, notify = true) => {
      offsetRef.current = toValue;
      Animated.timing(translateX, {
        toValue,
        duration: motion.duration.ui,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      if (!notify) return;
      onOpenChangeRef.current(toValue > 0 ? id : null);
    },
    [id, translateX],
  );

  useEffect(() => {
    if (openId !== id && offsetRef.current !== 0) {
      snapTo(0, false);
    }
  }, [id, openId, snapTo]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gs) =>
          !disabledRef.current && shouldCaptureConversationSwipe(gs.dx, gs.dy),
        onMoveShouldSetPanResponderCapture: (_, gs) =>
          !disabledRef.current && shouldCaptureConversationSwipe(gs.dx, gs.dy),
        onPanResponderGrant: () => {
          startOffsetRef.current = offsetRef.current;
          translateX.stopAnimation((value) => {
            startOffsetRef.current = value;
            offsetRef.current = value;
          });
          onOpenChangeRef.current(id);
        },
        onPanResponderMove: (_, gs) => {
          const next = clampConversationSwipe(startOffsetRef.current + gs.dx);
          offsetRef.current = next;
          translateX.setValue(next);
        },
        onPanResponderRelease: (_, gs) => {
          const next = clampConversationSwipe(startOffsetRef.current + gs.dx);
          offsetRef.current = next;
          if (shouldRevealConversationDelete(next)) {
            snapTo(CONVERSATION_SWIPE_MAX);
            onDeleteRef.current();
            return;
          }
          snapTo(0);
        },
        onPanResponderTerminate: () => {
          snapTo(0);
        },
      }),
    [id, snapTo, translateX],
  );

  const handleLongPress = () => {
    wrapRef.current?.measureInWindow((x, y, width, height) => {
      onLongPress({ x, y, width, height });
    });
  };

  const handlePress = () => {
    if (offsetRef.current > 4) {
      snapTo(0);
      return;
    }
    onPress();
  };

  return (
    <View ref={wrapRef} collapsable={false} style={styles.wrap}>
      <View
        pointerEvents="none"
        style={[
          styles.deleteStrip,
          conversationDeleteStripAnchor(),
          { backgroundColor: colors.danger, width: CONVERSATION_SWIPE_MAX },
        ]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <AppIcon name="trash" size={22} color={functional.onPrimary} />
      </View>
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <Pressable
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={380}
          disabled={disabled}
          style={({ pressed }) => [
            pressed && offsetRef.current <= 4 ? styles.pressed : null,
          ]}
        >
          {children}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
  deleteStrip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: motion.opacity.pressed,
  },
});
