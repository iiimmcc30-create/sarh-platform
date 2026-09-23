import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ambientShadow, ds } from '@/constants/designSystem';
import { motion, spacing } from '@/constants/theme';
import { motion as dsMotion } from '@/design-system/tokens/motion';
import { useAppChromeScroll } from '@/hooks/useAppChrome';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow } from '@/lib/rtl';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { navigateToCreateListing } from '@/lib/navigateToCreateListing';
import { isNavigationLocked, safeNavigateTab } from '@/lib/safeNavigate';
import { HOME_TAB_RESELECT_EVENT } from '@/lib/homeQuickAccess';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, DeviceEventEmitter, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** ~7–9% larger than the prior 22px glyph — still light on the bar. */
const ICON_SIZE = 24;
const ADD_BOX = 24;
const ADD_GLYPH = 15;
/** Nudge icons down without growing the bar height. */
const ICON_NUDGE_Y = 2;
const INDICATOR_W = 18;

type TabDef =
  | { kind: 'route'; route: string; icon: string; label: string }
  | { kind: 'create'; label: string };

/**
 * Visual RTL order (right→left):
 * الرئيسية · البحث · إضافة عرض · المحادثات · مجتمع سرح
 */
const TABS: TabDef[] = [
  { kind: 'route', route: 'index', icon: 'home-outline', label: 'الرئيسية' },
  { kind: 'route', route: 'search', icon: 'search', label: 'البحث' },
  { kind: 'create', label: 'إضافة عرض' },
  { kind: 'route', route: 'messages', icon: 'chatbubble-ellipses-outline', label: 'المحادثات' },
  { kind: 'route', route: 'posts', icon: 'people-outline', label: 'مجتمع سرح' },
];

export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useTheme();
  const { chromeProgress, chromeVisible, setChromeVisible, tabBarForceHidden } =
    useAppChromeScroll();
  const bottomPad = Math.max(insets.bottom, ds.tabBar.marginBottom);
  const tokens = scheme === 'light' ? ds.light : ds.dark;
  const activeTint = colors.electricBright;
  /** High-contrast inactive glyphs on glass — white in dark, black in light. */
  const inactiveTint = scheme === 'light' ? '#000000' : '#FFFFFF';
  const hideDistance = ds.tabBar.height + bottomPad + spacing.md;

  const activeRoute = state.routes[state.index]?.name;
  const layouts = useRef<Record<string, { x: number; width: number }>>({});
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorReady = useRef(false);
  const indicatorAnim = useRef<Animated.CompositeAnimation | null>(null);
  const lastRouteRef = useRef(activeRoute);

  const moveIndicator = (routeName: string, animated: boolean) => {
    const layout = layouts.current[routeName];
    if (!layout) return;
    const nextX = layout.x + (layout.width - INDICATOR_W) / 2;
    indicatorAnim.current?.stop();
    if (!animated || !indicatorReady.current) {
      indicatorX.setValue(nextX);
      indicatorReady.current = true;
      return;
    }
    indicatorAnim.current = Animated.timing(indicatorX, {
      toValue: nextX,
      duration: dsMotion.duration.ui,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    indicatorAnim.current.start();
  };

  useEffect(() => {
    if (activeRoute) moveIndicator(activeRoute, true);
    if (activeRoute && lastRouteRef.current !== activeRoute) {
      lastRouteRef.current = activeRoute;
      setChromeVisible(true);
    }
  }, [activeRoute, setChromeVisible]);

  const onTabPress = (routeName: string, isFocused: boolean) => {
    const route = state.routes.find((r) => r.name === routeName);
    if (isFocused) {
      if (routeName === 'index') {
        DeviceEventEmitter.emit(HOME_TAB_RESELECT_EVENT);
      }
      setChromeVisible(true);
      return;
    }
    if (isNavigationLocked()) return;
    const event = navigation.emit({
      type: 'tabPress',
      target: route?.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      safeNavigateTab((name) => navigation.navigate(name), routeName, isFocused);
    }
  };

  const translateY = chromeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [hideDistance, 0],
  });

  if (tabBarForceHidden) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          opacity: chromeProgress,
          transform: [{ translateY }],
        },
        ambientShadow(scheme, 'soft'),
      ]}
      pointerEvents={chromeVisible ? 'box-none' : 'none'}
    >
      <View
        style={[
          styles.bar,
          { paddingBottom: bottomPad },
          {
            backgroundColor: tokens.glass,
            borderTopColor: tokens.glassBorder,
          },
        ]}
      >
        <View style={[styles.row, getRtlRow()]}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              {
                backgroundColor: activeTint,
                transform: [{ translateX: indicatorX }],
              },
            ]}
          />
          {TABS.map((tab) => {
            if (tab.kind === 'create') {
              return (
                <Pressable
                  key="create"
                  accessibilityRole="button"
                  accessibilityLabel={tab.label}
                  onPress={() => void navigateToCreateListing()}
                  style={({ pressed }) => [styles.tabSlot, pressed && styles.pressed]}
                >
                  <View style={styles.iconSlot}>
                    <View style={[styles.addBox, { borderColor: inactiveTint }]}>
                      <AppIcon name="plus" size={ADD_GLYPH} color={activeTint} variant="sr" />
                    </View>
                  </View>
                </Pressable>
              );
            }

            const focused = activeRoute === tab.route;
            const tint = focused ? activeTint : inactiveTint;
            return (
              <Pressable
                key={tab.route}
                accessibilityRole="button"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: focused }}
                onPress={() => onTabPress(tab.route, focused)}
                onLayout={(event) => {
                  layouts.current[tab.route] = {
                    x: event.nativeEvent.layout.x,
                    width: event.nativeEvent.layout.width,
                  };
                  if (tab.route === activeRoute) {
                    moveIndicator(tab.route, indicatorReady.current);
                  }
                }}
                style={({ pressed }) => [styles.tabSlot, pressed && styles.pressed]}
              >
                <TabGlyph focused={focused}>
                  <View style={styles.iconSlot}>
                    <AppIcon
                      name={tab.icon}
                      size={ICON_SIZE}
                      color={tint}
                      variant={focused ? 'sr' : 'rr'}
                    />
                  </View>
                </TabGlyph>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

function TabGlyph({ focused, children }: { focused: boolean; children: ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;
  const prev = useRef(focused);

  useEffect(() => {
    if (focused && !prev.current) {
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.06,
          duration: dsMotion.duration.press,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: dsMotion.duration.ui,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
    prev.current = focused;
  }, [focused, scale]);

  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: ds.tabBar.marginH,
  },
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  row: {
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  tabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 52,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  /** Fixed icon box so every tab (including +) shares the same visual height. */
  iconSlot: {
    width: ICON_SIZE + 2,
    height: ICON_SIZE + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: ICON_NUDGE_Y,
  },
  addBox: {
    width: ADD_BOX,
    height: ADD_BOX,
    borderRadius: 5,
    borderWidth: 1.75,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: motion.pressScale }],
    opacity: 0.92,
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    width: INDICATOR_W,
    height: 2,
    borderRadius: 1,
  },
});

export default FloatingTabBar;
