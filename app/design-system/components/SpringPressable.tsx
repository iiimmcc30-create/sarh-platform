import { useState, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { press, spring } from '../tokens/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressState = { pressed: boolean };

export type SpringPressableProps = Omit<PressableProps, 'style' | 'children'> & {
  /** Static style or `({ pressed }) => style`. Do not pass `transform` — the scale owns it. */
  style?: StyleProp<ViewStyle> | ((state: PressState) => StyleProp<ViewStyle>);
  children?: ReactNode | ((state: PressState) => ReactNode);
  /** Scale while held (`1` = no scale, opacity/colour feedback only). */
  pressedScale?: number;
};

/**
 * iOS-style press feedback: the control eases down while held and springs back on
 * release (RN Animated, native driver) instead of snapping between two scales.
 */
export function SpringPressable({
  style,
  children,
  pressedScale = press.scale,
  onPressIn,
  onPressOut,
  ...rest
}: SpringPressableProps) {
  const [scale] = useState(() => new Animated.Value(1));
  const [pressed, setPressed] = useState(false);

  const animate = (toValue: number, config: typeof spring.pressIn | typeof spring.pressOut) => {
    Animated.spring(scale, { toValue, ...config, useNativeDriver: true }).start();
  };

  const handlePressIn = (e: GestureResponderEvent) => {
    setPressed(true);
    if (pressedScale !== 1) animate(pressedScale, spring.pressIn);
    onPressIn?.(e);
  };
  const handlePressOut = (e: GestureResponderEvent) => {
    setPressed(false);
    if (pressedScale !== 1) animate(1, spring.pressOut);
    onPressOut?.(e);
  };

  const state = { pressed };
  const resolvedStyle = typeof style === 'function' ? style(state) : style;

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[resolvedStyle, { transform: [{ scale }] }]}
    >
      {typeof children === 'function' ? children(state) : children}
    </AnimatedPressable>
  );
}

export default SpringPressable;
