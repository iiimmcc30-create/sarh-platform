import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import type { ParamListBase, ScreenLayoutArgs } from '@react-navigation/native';
import type { NativeStackNavigationOptions, NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  FADE_SCALE_BACK_MS,
  FADE_SCALE_FROM,
  FADE_SCALE_OPEN_MS,
  isImmediateNavAction,
  shouldSkipFadeScale,
} from '@/lib/screenTransition';

type FadeScaleAppearProps = {
  children: ReactNode;
  routeKey: string;
  navigation: NativeStackNavigationProp<ParamListBase>;
};

function isInitialStackRoute(
  navigation: NativeStackNavigationProp<ParamListBase>,
  routeKey: string,
): boolean {
  const state = navigation.getState?.();
  if (!state || state.type !== 'stack') return false;
  return state.routes[0]?.key === routeKey && state.index === 0;
}

/**
 * Screen opens inside the current one: opacity 0→1, scale 0.96→1.
 * Direction-independent. Back reverses the same motion. RN Animated only.
 */
export function FadeScaleAppear({
  children,
  routeKey,
  navigation,
}: FadeScaleAppearProps) {
  const skipEnter = isInitialStackRoute(navigation, routeKey);
  const progress = useRef(new Animated.Value(skipEnter ? 1 : 0)).current;
  const closingRef = useRef(false);

  useEffect(() => {
    if (skipEnter) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: FADE_SCALE_OPEN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, skipEnter]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (closingRef.current) return;
      if (isInitialStackRoute(navigation, routeKey)) return;
      if (isImmediateNavAction(event.data.action.type)) return;

      closingRef.current = true;
      event.preventDefault();
      Animated.timing(progress, {
        toValue: 0,
        duration: FADE_SCALE_BACK_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          closingRef.current = false;
          return;
        }
        navigation.dispatch(event.data.action);
      });
    });
    return unsubscribe;
  }, [navigation, progress, routeKey]);

  return (
    <Animated.View
      style={[
        styles.fill,
        {
          opacity: progress,
          transform: [
            {
              scale: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [FADE_SCALE_FROM, 1],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});

export function fadeScaleScreenLayout({
  route,
  navigation,
  children,
}: ScreenLayoutArgs<
  ParamListBase,
  string,
  NativeStackNavigationOptions,
  NativeStackNavigationProp<ParamListBase>
>): ReactElement {
  if (shouldSkipFadeScale(route.name)) return children;
  return (
    <FadeScaleAppear routeKey={route.key} navigation={navigation}>
      {children}
    </FadeScaleAppear>
  );
}
