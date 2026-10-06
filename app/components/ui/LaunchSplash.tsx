import { sarh } from '@/constants/sarhTokens';
import { fontFamily } from '@/design-system/tokens/typography';
import {
  launchSplashFallbackMs,
  LAUNCH_LOGO_START_SCALE,
  LAUNCH_SPLASH_TIMING,
  SARH_LOGO_PATH_LENGTHS,
  launchSplashLayout,
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

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Always the app-icon look, in Light and Dark alike: reference black surface with the
 * white waves and white names. Matches the native splash (app.json, #020202). No gradient.
 */
const SPLASH_BG = sarh.color.darkBackground;
const SPLASH_INK = SARH_LOGO_INK_DARK;
/** Outline width while drawing (viewBox units of the 611×417 mark). */
const DRAW_STROKE = 5;

type LaunchSplashProps = {
  /** Fonts loaded (or boot timed out) — safe to hide the native splash. */
  nativeReady: boolean;
  /** Fonts + session restore + onboarding state loaded (or boot timed out). */
  bootReady: boolean;
};

const easeOut = Easing.out(Easing.cubic);
const easeInOut = Easing.inOut(Easing.cubic);

/**
 * In-app launch splash. Sits above the navigator so routing (auth, onboarding,
 * deep links, notification opens) is decided underneath, unchanged; the overlay
 * only fades away once the animation finished and boot is ready.
 *
 * Hand-off: the native splash (plain #020202 in both schemes) stays until this overlay's
 * first layout (same black), then `SplashScreen.hideAsync()` — no flash.
 */
export const LaunchSplash = memo(function LaunchSplash({ nativeReady, bootReady }: LaunchSplashProps) {
  const { width, height } = useWindowDimensions();
  const layout = useMemo(() => launchSplashLayout(width, height, SARH_LOGO_MARK_ASPECT), [width, height]);

  const [laidOut, setLaidOut] = useState(false);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [animationDone, setAnimationDone] = useState(false);
  /** Text mounts only once fonts are ready, so Tajawal (not a fallback face) is measured. */
  const [started, setStarted] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [gone, setGone] = useState(false);
  const startedRef = useRef(false);

  const [values] = useState(() => ({
    draw: SARH_LOGO_PATH_LENGTHS.map((len) => new Animated.Value(len)),
    fill: new Animated.Value(0),
    settle: new Animated.Value(0),
    title: new Animated.Value(0),
    subtitle: new Animated.Value(0),
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
    setStarted(true);

    const t = LAUNCH_SPLASH_TIMING;
    const intro = reduceMotion
      ? Animated.sequence([
          Animated.parallel([
            Animated.timing(values.title, { toValue: 1, duration: t.reducedTextDuration, useNativeDriver: true }),
            Animated.timing(values.subtitle, { toValue: 1, duration: t.reducedTextDuration, useNativeDriver: true }),
          ]),
          Animated.delay(t.reducedHold),
        ])
      : Animated.sequence([
          Animated.parallel([
            ...values.draw.map((v, i) =>
              Animated.timing(v, {
                toValue: 0,
                delay: t.draw[i][0],
                duration: t.draw[i][1],
                easing: easeInOut,
                useNativeDriver: false,
              }),
            ),
            Animated.timing(values.fill, {
              toValue: 1,
              delay: t.fillDelay,
              duration: t.fillDuration,
              easing: easeOut,
              useNativeDriver: false,
            }),
            Animated.timing(values.settle, {
              toValue: 1,
              delay: t.settleDelay,
              duration: t.settleDuration,
              easing: easeOut,
              useNativeDriver: true,
            }),
            Animated.timing(values.title, {
              toValue: 1,
              delay: t.titleDelay,
              duration: t.textDuration,
              easing: easeOut,
              useNativeDriver: true,
            }),
            Animated.timing(values.subtitle, {
              toValue: 1,
              delay: t.subtitleDelay,
              duration: t.textDuration,
              easing: easeOut,
              useNativeDriver: true,
            }),
          ]),
          Animated.delay(t.holdAfter),
        ]);

    if (reduceMotion) {
      values.draw.forEach((v) => v.setValue(0));
      values.fill.setValue(1);
      values.settle.setValue(1);
    }

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

  if (gone) return null;

  // Before settling, the hidden text still reserves its space (no layout jump);
  // the mark is shifted down so it starts optically centred, then rises into place.
  const textBlock = layout.logoGap + layout.titleLineHeight + layout.textGap + layout.subtitleLineHeight;
  const logoTransform = [
    {
      translateY: values.settle.interpolate({ inputRange: [0, 1], outputRange: [textBlock / 2, 0] }),
    },
    {
      scale: values.settle.interpolate({ inputRange: [0, 1], outputRange: [LAUNCH_LOGO_START_SCALE, 1] }),
    },
  ];
  const textRise = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  });
  const strokeOpacity = values.fill.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

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
          <Svg
            width={layout.logoWidth}
            height={layout.logoHeight}
            viewBox={`0 0 ${SARH_LOGO_MARK_VIEWBOX_WIDTH} ${SARH_LOGO_MARK_VIEWBOX_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {SARH_LOGO_MARK_PATHS.map((d, i) => {
              return (
                <AnimatedPath
                  key={i}
                  d={d}
                  fill={SPLASH_INK}
                  fillOpacity={values.fill}
                  stroke={SPLASH_INK}
                  strokeOpacity={strokeOpacity}
                  strokeWidth={DRAW_STROKE}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={[SARH_LOGO_PATH_LENGTHS[i], SARH_LOGO_PATH_LENGTHS[i]]}
                  strokeDashoffset={values.draw[i]}
                />
              );
            })}
          </Svg>
        </Animated.View>

        {/* Fixed-height, full-width box: space is reserved from the first frame (no
            layout jump) and wide enough that Arabic shaping is never clipped. */}
        <View
          style={{
            width,
            marginTop: layout.logoGap,
            height: layout.titleLineHeight + layout.textGap + layout.subtitleLineHeight,
          }}
        >
          {started ? (
            <>
              <Animated.Text
                allowFontScaling={false}
                numberOfLines={1}
                style={[
                  styles.title,
                  { fontSize: layout.titleSize, lineHeight: layout.titleLineHeight },
                  textRise(values.title),
                ]}
              >
                سرح
              </Animated.Text>
              <Animated.Text
                allowFontScaling={false}
                numberOfLines={1}
                style={[
                  styles.subtitle,
                  {
                    marginTop: layout.textGap,
                    fontSize: layout.subtitleSize,
                    lineHeight: layout.subtitleLineHeight,
                    letterSpacing: layout.subtitleSize * 0.08,
                  },
                  textRise(values.subtitle),
                ]}
              >
                Sarh
              </Animated.Text>
            </>
          ) : null}
        </View>
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
  title: {
    alignSelf: 'stretch',
    fontFamily: fontFamily.bold,
    color: SPLASH_INK,
    textAlign: 'center',
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
  subtitle: {
    alignSelf: 'stretch',
    fontFamily: fontFamily.regular,
    color: SPLASH_INK,
    textAlign: 'center',
    writingDirection: 'ltr',
    includeFontPadding: false,
  },
});
