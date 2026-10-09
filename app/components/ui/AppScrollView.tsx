import { useBindChromeScroll } from '@/hooks/useAppChrome';
import React, { forwardRef, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export type AppScrollViewProps = ScrollViewProps & {
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Bind the shared tab-shell hide-on-scroll. Disable for local collapse. */
  bindChromeScroll?: boolean;
  /**
   * Native-driven vertical offset (Animated.event on the UI thread; JS on web). The JS
   * `onScroll` still runs as the event listener. Renders an Animated.ScrollView.
   */
  nativeScrollY?: Animated.Value;
};

/**
 * Shared scroll defaults for Sarh — iOS-like momentum / inertia.
 * Callers may override any prop (e.g. carousels using decelerationRate="fast").
 */
export const AppScrollView = forwardRef<ScrollView, AppScrollViewProps>(
  function AppScrollView(
    {
      showsVerticalScrollIndicator = false,
      showsHorizontalScrollIndicator = false,
      keyboardShouldPersistTaps = 'handled',
    // iOS: keyboard follows the finger down; Android: dismiss once the user drags.
    keyboardDismissMode = Platform.OS === 'ios' ? 'interactive' : 'on-drag',
      scrollEventThrottle = 16,
      decelerationRate = 'normal',
      bounces = true,
      alwaysBounceVertical,
      overScrollMode,
      onScroll,
      bindChromeScroll = true,
      nativeScrollY,
      ...rest
    },
    ref,
  ) {
    const boundScroll = useBindChromeScroll(onScroll);
    const handler = bindChromeScroll ? boundScroll : onScroll;
    // Stable Animated.event (re-creating it re-attaches the native event every render).
    const handlerRef = useRef(handler);
    useEffect(() => {
      handlerRef.current = handler;
    }, [handler]);
    const listener = useCallback(
      (event: NativeSyntheticEvent<NativeScrollEvent>) => handlerRef.current?.(event),
      [],
    );
    const animatedScroll = useMemo(
      () =>
        nativeScrollY
          ? Animated.event([{ nativeEvent: { contentOffset: { y: nativeScrollY } } }], {
              useNativeDriver: Platform.OS !== 'web',
              listener,
            })
          : undefined,
      [listener, nativeScrollY],
    );
    const Scroller = nativeScrollY ? Animated.ScrollView : ScrollView;
    return (
      <Scroller
        ref={ref}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        scrollEventThrottle={scrollEventThrottle}
        decelerationRate={decelerationRate}
        bounces={bounces}
        alwaysBounceVertical={alwaysBounceVertical ?? bounces}
        overScrollMode={overScrollMode ?? (Platform.OS === 'android' ? 'always' : undefined)}
        onScroll={animatedScroll ?? handler}
        {...rest}
      />
    );
  },
);

export default AppScrollView;
