import { useCallback, useMemo, useRef } from 'react';
import { Animated } from 'react-native';

/**
 * Scroll-linked collapsing chrome without React re-renders.
 * `diffClamp` hides the identity row on scroll-down and reveals it on
 * scroll-up from any offset. Sticky tabs share the same translate.
 */
export function useCollapsibleSearchHeader(range: number) {
  const scrollY = useRef(new Animated.Value(0)).current;
  const safeRange = Math.max(1, Math.round(range));

  // Overscroll reports negative y. Feeding that into diffClamp treats the
  // bounce-back as a positive delta and the header appears to reverse 1–2px.
  const nonNegativeY = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
        extrapolateLeft: 'clamp',
        extrapolateRight: 'extend',
      }),
    [scrollY],
  );

  const clamped = useMemo(
    () => Animated.diffClamp(nonNegativeY, 0, safeRange),
    [nonNegativeY, safeRange],
  );

  const translateY = useMemo(
    () =>
      clamped.interpolate({
        inputRange: [0, safeRange],
        outputRange: [0, -safeRange],
        extrapolate: 'clamp',
      }),
    [clamped, safeRange],
  );

  const identityOpacity = useMemo(
    () =>
      clamped.interpolate({
        inputRange: [0, safeRange * 0.55, safeRange],
        outputRange: [1, 0.45, 0],
        extrapolate: 'clamp',
      }),
    [clamped, safeRange],
  );

  const paddingFor = useCallback(
    (expanded: number) =>
      clamped.interpolate({
        inputRange: [0, safeRange],
        outputRange: [expanded, Math.max(0, expanded - safeRange)],
        extrapolate: 'clamp',
      }),
    [clamped, safeRange],
  );

  const bindScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: false,
      }),
    [scrollY],
  );

  const resetCollapse = useCallback(() => {
    scrollY.setValue(0);
  }, [scrollY]);

  return {
    scrollY,
    clamped,
    translateY,
    identityOpacity,
    paddingFor,
    bindScroll,
    resetCollapse,
    range: safeRange,
  };
}
