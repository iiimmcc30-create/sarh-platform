import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ds } from '@/constants/designSystem';
import { spacing } from '@/constants/theme';
import { motion as dsMotion } from '@/design-system/tokens/motion';
import { useAppChromeScroll } from '@/hooks/useAppChrome';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow } from '@/lib/rtl';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { navigateToCreateListing } from '@/lib/navigateToCreateListing';
import { isNavigationLocked, safeNavigateTab } from '@/lib/safeNavigate';
import { HOME_TAB_RESELECT_EVENT } from '@/lib/homeQuickAccess';
import { isTabBarHiddenForRoute } from '@/lib/tabBarVisibility';
import { CouncilMiniPlayer } from '@/components/councils/CouncilMiniPlayer';
import {
  TAB_ACTIVATE_SCALE,
  TAB_PRESS_IN_MS,
  TAB_PRESS_OPACITY,
  TAB_PRESS_OUT_MS,
  TAB_PRESS_SCALE,
} from '@/lib/tabBarMotion';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, DeviceEventEmitter, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** ~7–9% larger than the prior 22px glyph — still light on the bar. */
const ICON_SIZE = 24;
const ADD_BOX = 24;
const ADD_GLYPH = 15;

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
  const lastRouteRef = useRef(activeRoute);

  useEffect(() => {
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

  // Route-based hide (e.g. the profile tab): comes back as soon as another tab is active.
  if (tabBarForceHidden || isTabBarHiddenForRoute(activeRoute)) {
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
      ]}
      pointerEvents={chromeVisible ? 'box-none' : 'none'}
    >
      {/* «المجالس» listening session: docked above the tab row (moves with the bar). */}
      <CouncilMiniPlayer />
      <View
        style={[
          styles.bar,
          { paddingBottom: bottomPad },
          {
            backgroundColor: tokens.tabBar,
            borderTopColor: tokens.glassBorder,
          },
        ]}
      >
        <View style={[styles.row, getRtlRow()]}>
          {TABS.map((tab) => {
            if (tab.kind === 'create') {
              return (
                <TabPressable
                  key="create"
                  label={tab.label}
                  onPress={() => void navigateToCreateListing()}
                >
                  <View style={styles.iconSlot}>
                    <View style={[styles.addBox, { borderColor: inactiveTint }]}>
                      <AppIcon name="plus" size={ADD_GLYPH} color={activeTint} variant="sr" />
                    </View>
                  </View>
                </TabPressable>
              );
            }

            const focused = activeRoute === tab.route;
            const tint = focused ? activeTint : inactiveTint;
            return (
              <TabPressable
                key={tab.route}
                label={tab.label}
                focused={focused}
                selectable
                onPress={() => onTabPress(tab.route, focused)}
              >
                <View style={styles.iconSlot}>
                  <AppIcon
                    name={tab.icon}
                    size={ICON_SIZE}
                    color={tint}
                    variant={focused ? 'sr' : 'rr'}
                  />
                </View>
              </TabPressable>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

type TabPressableProps = {
  label: string;
  onPress: () => void;
  children: ReactNode;
  focused?: boolean;
  /** Route tabs expose selected state; the create action does not. */
  selectable?: boolean;
};

/**
 * Tab slot. The active state is the icon variant only. The glyph gets a light,
 * fast press + activation motion (native driver, transform/opacity only), so
 * the slot and bar dimensions never change. onPress behavior is untouched.
 */
function TabPressable({
  label,
  onPress,
  children,
  focused = false,
  selectable = false,
}: TabPressableProps) {
  const activation = useRef(new Animated.Value(1)).current;
  const press = useRef(new Animated.Value(0)).current;
  const prevFocused = useRef(focused);

  useEffect(() => {
    if (focused && !prevFocused.current) {
      Animated.sequence([
        Animated.timing(activation, {
          toValue: TAB_ACTIVATE_SCALE,
          duration: dsMotion.duration.press,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(activation, {
          toValue: 1,
          duration: dsMotion.duration.ui,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevFocused.current = focused;
  }, [focused, activation]);

  const { scale, opacity } = useMemo(
    () => ({
      scale: Animated.multiply(
        activation,
        press.interpolate({ inputRange: [0, 1], outputRange: [1, TAB_PRESS_SCALE] }),
      ),
      opacity: press.interpolate({ inputRange: [0, 1], outputRange: [1, TAB_PRESS_OPACITY] }),
    }),
    [activation, press],
  );

  const animatePress = (pressed: boolean) => {
    Animated.timing(press, {
      toValue: pressed ? 1 : 0,
      duration: pressed ? TAB_PRESS_IN_MS : TAB_PRESS_OUT_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  // Transform/opacity only (TAB_GLYPH_ANIMATED_STYLE_KEYS) - layout never changes.
  const glyphMotionStyle = { opacity, transform: [{ scale }] };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selectable ? { selected: focused } : undefined}
      onPress={onPress}
      onPressIn={() => animatePress(true)}
      onPressOut={() => animatePress(false)}
      style={styles.tabSlot}
    >
      <Animated.View style={glyphMotionStyle}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: ds.tabBar.marginH,
  },
  /** Thin X-style bar: hairline top border, no shadow, single ds.tabBar.height (52px) icon row. */
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xs,
  },
  row: {
    alignItems: 'center',
    justifyContent: 'space-between',
    height: ds.tabBar.height,
  },
  tabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: ds.tabBar.height,
    paddingHorizontal: 2,
  },
  /** Fixed icon box so every tab (including +) shares the same visual height. */
  iconSlot: {
    width: ICON_SIZE + 2,
    height: ICON_SIZE + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBox: {
    width: ADD_BOX,
    height: ADD_BOX,
    borderRadius: 5,
    borderWidth: 1.75,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default FloatingTabBar;
