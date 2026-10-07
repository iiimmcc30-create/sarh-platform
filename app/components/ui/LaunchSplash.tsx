import { sarh } from '@/constants/sarhTokens';
import {
  launchSplashChannels,
  launchSplashDrawEdges,
  launchSplashFallbackMs,
  LAUNCH_LOGO_START_SCALE,
  LAUNCH_SPLASH_TIMING,
  launchSplashLayout,
  mapTimelineRange,
  shouldExitLaunchSplash,
} from '@/lib/launchSplash';
import { markPerf } from '@/lib/perfDev';
import {
  SARH_LOGO_INK_DARK,
  SARH_LOGO_MARK_ASPECT,
  SARH_LOGO_MARK_PATHS,
  SARH_LOGO_MARK_VIEWBOX_HEIGHT,
  SARH_LOGO_MARK_VIEWBOX_WIDTH,
} from '@/components/ui/SarhLogoMark';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * Always the app-icon look, in Light and Dark alike: reference black surface with the
 * white waves only (logo only, no «سرح / Sarh» wordmark). Matches the native splash
 * (app.json, #020202). No gradient.
 */
const SPLASH_BG = sarh.color.darkBackground;
const SPLASH_INK = SARH_LOGO_INK_DARK;
/** Outline width while drawing (viewBox units of the 611×417 mark). */
const DRAW_STROKE = 5;
const viewBox = `0 0 ${SARH_LOGO_MARK_VIEWBOX_WIDTH} ${SARH_LOGO_MARK_VIEWBOX_HEIGHT}`;

type LaunchSplashProps = {
  /** Fonts loaded (or boot timed out) — safe to hide the native splash. */
  nativeReady: boolean;
  /** Fonts + session restore + onboarding state loaded (or boot timed out). */
  bootReady: boolean;
};

const easeOut = Easing.out(Easing.cubic);

/**
 * In-app launch splash. Sits above the navigator so routing (auth, onboarding,
 * deep links, notification opens) is decided underneath, unchanged; the overlay
 * only fades away once the animation finished and boot is ready.
 *
 * Hand-off: the native splash (plain #020202 in both schemes) stays until this overlay's
 * first layout (same black, nothing drawn yet), then `SplashScreen.hideAsync()` — no flash.
 *
 * Smoothness: the intro is ONE native-driven timeline (see `launchSplashChannels`). Only
 * transform/opacity are animated — the outline is revealed by a sliding clip window
 * instead of a JS-driven `strokeDashoffset` — so the logo never stalls while the JS
 * thread mounts the app underneath (auth restore, routing, first screen).
 */
export const LaunchSplash = memo(function LaunchSplash({ nativeReady, bootReady }: LaunchSplashProps) {
  const { width, height } = useWindowDimensions();
  const layout = useMemo(() => launchSplashLayout(width, height, SARH_LOGO_MARK_ASPECT), [width, height]);

  const [laidOut, setLaidOut] = useState(false);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [animationDone, setAnimationDone] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [gone, setGone] = useState(false);
  const startedRef = useRef(false);

  const [values] = useState(() => ({
    /** Whole intro: 0 → 1 on the UI thread. */
    timeline: new Animated.Value(0),
    exit: new Animated.Value(1),
  }));

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduceMotion(Boolean(v)))
      .catch(() => alive && setReduceMotion(false));
    return () => {
      alive = false;
    };
  }, []);

  const onLayout = useCallback((_e: LayoutChangeEvent) => setLaidOut(true), []);

  // Native splash → this overlay, then play the intro once.
  useEffect(() => {
    if (startedRef.current || !laidOut || !nativeReady || reduceMotion === null) return;
    startedRef.current = true;

    // One linear native timeline; every channel is a (sampled-easing) interpolation of it.
    const intro = Animated.timing(values.timeline, {
      toValue: 1,
      duration: launchSplashChannels(reduceMotion).totalMs,
      easing: Easing.linear,
      useNativeDriver: true,
    });

    // Exit waits for the intro's own completion callback (finished=true) — never a
    // parallel timer. The fallback below only covers an interrupted animation.
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      setAnimationDone(true);
    };
    const fallback = setTimeout(finish, launchSplashFallbackMs(reduceMotion));
    const start = () => {
      markPerf('launch-splash-start');
      intro.start(({ finished }) => {
        if (finished) {
          clearTimeout(fallback);
          finish();
        }
      });
    };
    markPerf('native-splash-hide');
    SplashScreen.hideAsync()
      .catch(() => {})
      .finally(start);
  }, [laidOut, nativeReady, reduceMotion, values]);

  useEffect(() => {
    if (exiting || !shouldExitLaunchSplash({ animationDone, bootReady })) return;
    setExiting(true);
    Animated.timing(values.exit, {
      toValue: 0,
      duration: LAUNCH_SPLASH_TIMING.exitDuration,
      easing: easeOut,
      useNativeDriver: true,
    }).start(() => {
      markPerf('launch-splash-end');
      setGone(true);
    });
  }, [animationDone, bootReady, exiting, values]);

  // Interpolations are built once per layout / motion mode (stable native nodes).
  const anim = useMemo(() => {
    const ch = launchSplashChannels(Boolean(reduceMotion));
    const tl = values.timeline;
    const W = layout.logoWidth;
    return {
      // Logo only: the mark stays centred and just settles from large to its final size.
      logoTransform: [
        { scale: tl.interpolate({ ...mapTimelineRange(ch.settle, LAUNCH_LOGO_START_SCALE, 1), extrapolate: 'clamp' }) },
      ],
      fillOpacity: tl.interpolate({ ...ch.fill, extrapolate: 'clamp' }),
      strokeOpacity: tl.interpolate({ ...mapTimelineRange(ch.fill, 1, 0), extrapolate: 'clamp' }),
      // Left → right reveal per wave: the clip window slides right while its content
      // slides left by the same amount, so the outline stays put and appears progressively.
      wipes: ch.draw.map((range, i) => {
        const [from, to] = launchSplashDrawEdges(i, W, SARH_LOGO_MARK_VIEWBOX_WIDTH);
        return {
          window: tl.interpolate({ ...mapTimelineRange(range, from - W, to - W), extrapolate: 'clamp' }),
          content: tl.interpolate({ ...mapTimelineRange(range, W - from, W - to), extrapolate: 'clamp' }),
        };
      }),
    };
  }, [layout, reduceMotion, values]);

  if (gone) return null;

  const { logoTransform, strokeOpacity, fillOpacity, wipes } = anim;

  return (
    <Animated.View
      testID="launch-splash"
      onLayout={onLayout}
      pointerEvents={exiting ? 'none' : 'auto'}
      accessible
      accessibilityLabel="سرح"
      style={[styles.root, { opacity: values.exit }]}
    >
      {/* Black surface in every scheme -> light status-bar content; unmounts with the splash. */}
      <StatusBar style="light" />
      <View style={styles.group}>
        <Animated.View style={{ width: layout.logoWidth, height: layout.logoHeight, transform: logoTransform }}>
          {/* Outline, drawn in wave by wave (native clip window per wave). */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: strokeOpacity }]}>
            {SARH_LOGO_MARK_PATHS.map((d, i) => (
              <Animated.View
                key={i}
                style={[styles.wipeWindow, { transform: [{ translateX: wipes[i].window }] }]}
              >
                <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: wipes[i].content }] }]}>
                  <Svg
                    width={layout.logoWidth}
                    height={layout.logoHeight}
                    viewBox={viewBox}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <Path
                      d={d}
                      fill="none"
                      stroke={SPLASH_INK}
                      strokeWidth={DRAW_STROKE}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </Svg>
                </Animated.View>
              </Animated.View>
            ))}
          </Animated.View>
          {/* Solid mark fades in as the outline completes. */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: fillOpacity }]}>
            <Svg
              width={layout.logoWidth}
              height={layout.logoHeight}
              viewBox={viewBox}
              preserveAspectRatio="xMidYMid meet"
            >
              {SARH_LOGO_MARK_PATHS.map((d, i) => (
                <Path key={i} d={d} fill={SPLASH_INK} />
              ))}
            </Svg>
          </Animated.View>
        </Animated.View>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: SPLASH_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Clip window of one wave's outline (inside the logo box only). */
  wipeWindow: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
});
