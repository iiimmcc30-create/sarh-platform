import { readFileSync } from 'fs';
import path from 'path';
import {
  LAUNCH_LOGO_START_SCALE,
  LAUNCH_SPLASH_TIMING,
  SARH_LOGO_PATH_LENGTHS,
  SARH_LOGO_PATH_X_EXTENTS,
  launchSplashChannels,
  launchSplashDrawEdges,
  launchSplashFallbackMs,
  launchSplashLayout,
  launchSplashTextCompleteMs,
  launchSplashTotalMs,
  mapTimelineRange,
  shouldExitLaunchSplash,
  timelineSegment,
  type TimelineRange,
} from '@/lib/launchSplash';
import { AUTH_ENTRY_HREF, resolveBootNavigation } from '@/lib/bootRouting';

const root = path.join(__dirname, '..');
const src = (p: string) => readFileSync(path.join(root, p), 'utf8');
const ASPECT = 611 / 417;

describe('launch splash timing', () => {
  it('keeps the intro calm (~1.8–2.6 s) and short with reduce motion', () => {
    const total = launchSplashTotalMs(false);
    expect(total).toBeGreaterThanOrEqual(1800);
    expect(total).toBeLessThanOrEqual(2600);
    expect(launchSplashTotalMs(true)).toBeLessThan(1200);
    expect(LAUNCH_SPLASH_TIMING.exitDuration).toBeLessThanOrEqual(400);
  });

  it('draws first, then settles, then shows text', () => {
    const t = LAUNCH_SPLASH_TIMING;
    expect(t.fillDelay).toBeLessThan(t.settleDelay);
    expect(t.settleDelay).toBeLessThan(t.titleDelay);
    expect(t.titleDelay).toBeLessThan(t.subtitleDelay);
    expect(LAUNCH_LOGO_START_SCALE).toBeGreaterThan(1);
    expect(SARH_LOGO_PATH_LENGTHS).toHaveLength(2);
    expect(LAUNCH_SPLASH_TIMING.draw).toHaveLength(SARH_LOGO_PATH_LENGTHS.length);
  });

  it('keeps both words fully visible for 600–800 ms before the exit fade', () => {
    const hold = launchSplashTotalMs(false) - launchSplashTextCompleteMs();
    expect(hold).toBeGreaterThanOrEqual(600);
    expect(hold).toBeLessThanOrEqual(800);
    expect(LAUNCH_SPLASH_TIMING.reducedHold).toBeGreaterThanOrEqual(600);
  });

  it('safety fallback is always longer than intro + hold', () => {
    expect(launchSplashFallbackMs(false)).toBeGreaterThan(launchSplashTotalMs(false) + 1000);
    expect(launchSplashFallbackMs(true)).toBeGreaterThan(launchSplashTotalMs(true) + 1000);
  });

  it('exits only when the animation is done and boot is ready', () => {
    expect(shouldExitLaunchSplash({ animationDone: true, bootReady: false })).toBe(false);
    expect(shouldExitLaunchSplash({ animationDone: false, bootReady: true })).toBe(false);
    expect(shouldExitLaunchSplash({ animationDone: true, bootReady: true })).toBe(true);
  });
});

describe('launch splash layout', () => {
  it.each([
    [320, 568],
    [360, 800],
    [393, 873],
    [412, 915],
    [1024, 1366],
  ])('scales from the window (%i×%i) and fits', (w, h) => {
    const l = launchSplashLayout(w, h, ASPECT);
    expect(l.logoWidth).toBeLessThanOrEqual(Math.min(w, h) * 0.38 + 1);
    expect(l.logoWidth * LAUNCH_LOGO_START_SCALE).toBeLessThan(w);
    const group = l.logoHeight + l.logoGap + l.titleLineHeight + l.textGap + l.subtitleLineHeight;
    expect(group).toBeLessThan(h * 0.6);
    expect(l.subtitleSize).toBeLessThan(l.titleSize);
  });
});

describe('launch path', () => {
  it('logged-out launches go straight to login, never the old welcome', () => {
    expect(AUTH_ENTRY_HREF).toBe('/auth/phone');
    expect(
      resolveBootNavigation({
        authLoading: false,
        onboardingLoading: false,
        onboardingComplete: true,
        isAuthenticated: false,
        firstSegment: undefined,
      }),
    ).toEqual({ type: 'replace', href: '/auth/phone' });
  });

  it('no screen navigates to /auth/welcome anymore', () => {
    for (const file of [
      'lib/bootRouting.ts',
      'app/auth/phone.tsx',
      'app/auth/register.tsx',
      'app/verification.tsx',
      'components/ui/BootSplashGate.tsx',
    ]) {
      expect(src(file)).not.toContain('/auth/welcome');
    }
  });

  it('native splash is plain reference black in both schemes and hands off to the RN splash', () => {
    const app = JSON.parse(src('app.json'));
    const plugin = app.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen');
    expect(plugin[1].backgroundColor).toBe('#020202');
    expect(plugin[1].dark.backgroundColor).toBe('#020202');
    expect(plugin[1].image).toBe('./assets/images/splash-blank.png');

    const gate = src('components/ui/BootSplashGate.tsx');
    expect(gate).toContain('<LaunchSplash');
    const splash = src('components/ui/LaunchSplash.tsx');
    expect(splash).toContain('onLayout={onLayout}');
    expect(splash).toContain('SplashScreen.hideAsync()');
    expect(splash).toContain('SARH_LOGO_MARK_PATHS');
    expect(splash).not.toContain('useColorScheme');
    expect(splash).toContain('isReduceMotionEnabled');
    expect(splash).toContain('سرح');
    expect(splash).toContain('Sarh');
    expect(splash).not.toMatch(/react-native-reanimated|LinearGradient|shadow/i);
  });

  it('exit waits for the intro completion callback, text is never clipped', () => {
    const splash = src('components/ui/LaunchSplash.tsx');
    expect(splash).toContain('intro.start(({ finished }) => {');
    expect(splash).toMatch(/if \(finished\) \{\s*clearTimeout\(fallback\);\s*finish\(\);/);
    expect(splash).toContain('launchSplashFallbackMs(reduceMotion)');
    // Text mounts after fonts are ready (measured with Tajawal) inside a full-width box.
    expect(splash).toContain('{started ? (');
    expect(splash).toMatch(/style=\{\{\s*width,/);
    // Only the logo's outline clip windows clip; the text box never does.
    expect(splash.match(/overflow:\s*'hidden'/g)).toHaveLength(1);
    expect(splash).toMatch(/wipeWindow: \{\s*\.\.\.StyleSheet\.absoluteFillObject,\s*overflow: 'hidden',/);
    expect(splash).not.toMatch(/width:\s*values\./);
  });
});

/** Value of a range at timeline position x (linear between points, clamped). */
function sample(range: TimelineRange, x: number): number {
  const { inputRange: i, outputRange: o } = range;
  if (x <= i[0]) return o[0];
  for (let k = 1; k < i.length; k++) {
    if (x <= i[k]) return o[k - 1] + ((o[k] - o[k - 1]) * (x - i[k - 1])) / (i[k] - i[k - 1]);
  }
  return o[o.length - 1];
}

describe('launch splash native timeline (logo never stalls on a busy JS thread)', () => {
  it('runs the whole intro as one native-driven timeline: no JS-driven props, no JS delays', () => {
    const splash = src('components/ui/LaunchSplash.tsx');
    expect(splash).not.toMatch(/useNativeDriver:\s*false/);
    expect(splash).not.toContain('strokeDashoffset={');
    expect(splash).not.toContain('fillOpacity={');
    expect(splash).not.toContain('createAnimatedComponent');
    expect(splash).not.toMatch(/\bdelay:/);
    expect(splash).not.toContain('Animated.delay');
    expect(splash).toMatch(/Animated\.timing\(values\.timeline, \{[\s\S]*?useNativeDriver: true,/);
    expect(splash).toContain('launchSplashChannels(reduceMotion).totalMs');
    // Interpolations are memoised, not rebuilt on every render while the animation runs.
    expect(splash).toMatch(/const anim = useMemo\(\(\) => \{/);
  });

  it('keeps the original choreography on the 0→1 timeline', () => {
    const t = LAUNCH_SPLASH_TIMING;
    const ch = launchSplashChannels(false);
    expect(ch.totalMs).toBe(launchSplashTotalMs(false));
    const at = (ms: number) => ms / ch.totalMs;
    // Nothing visible at frame 0 (seamless hand-off from the plain black native splash).
    for (const d of ch.draw) expect(sample(d, 0)).toBe(0);
    expect(sample(ch.fill, 0)).toBe(0);
    expect(sample(ch.title, 0)).toBe(0);
    // Outline fully drawn when its segment ends; fill done after fillDelay + fillDuration.
    t.draw.forEach(([delay, dur], i) => {
      expect(sample(ch.draw[i], at(delay + dur))).toBeCloseTo(1, 5);
      if (delay > 0) expect(sample(ch.draw[i], at(delay))).toBe(0);
    });
    expect(sample(ch.fill, at(t.fillDelay))).toBe(0);
    expect(sample(ch.fill, at(t.fillDelay + t.fillDuration))).toBeCloseTo(1, 5);
    expect(sample(ch.settle, at(t.settleDelay))).toBe(0);
    expect(sample(ch.title, at(t.titleDelay))).toBe(0);
    expect(sample(ch.subtitle, at(t.subtitleDelay + t.textDuration))).toBeCloseTo(1, 5);
    // Everything settled at the end (hold).
    for (const r of [...ch.draw, ch.fill, ch.settle, ch.title, ch.subtitle]) expect(sample(r, 1)).toBe(1);
  });

  it('produces valid native interpolation ranges (strictly increasing 0…1, eased, monotonic)', () => {
    const all = [launchSplashChannels(false), launchSplashChannels(true)].flatMap((c) => [
      ...c.draw,
      c.fill,
      c.settle,
      c.title,
      c.subtitle,
    ]);
    for (const r of all) {
      expect(r.inputRange.length).toBe(r.outputRange.length);
      expect(r.inputRange.length).toBeGreaterThanOrEqual(2);
      expect(r.inputRange[0]).toBe(0);
      expect(r.inputRange[r.inputRange.length - 1]).toBe(1);
      for (let k = 1; k < r.inputRange.length; k++) {
        expect(r.inputRange[k]).toBeGreaterThan(r.inputRange[k - 1]);
        expect(r.outputRange[k]).toBeGreaterThanOrEqual(r.outputRange[k - 1] - 1e-9);
      }
    }
    // Eased (ease-out): the first half of the segment covers more than half the distance.
    const seg = timelineSegment({ startMs: 0, durationMs: 1000, totalMs: 1000, easing: (x) => 1 - (1 - x) ** 3 });
    expect(sample(seg, 0.5)).toBeGreaterThan(0.8);
    expect(timelineSegment({ startMs: 500, durationMs: 0, totalMs: 1000 })).toEqual({
      inputRange: [0, 1],
      outputRange: [1, 1],
    });
    expect(mapTimelineRange(seg, 10, 20).outputRange[0]).toBe(10);
    expect(mapTimelineRange(seg, 10, 20).outputRange[seg.outputRange.length - 1]).toBe(20);
  });

  it('reduce motion: logo already complete, text fades quickly', () => {
    const ch = launchSplashChannels(true);
    for (const d of ch.draw) expect(sample(d, 0)).toBe(1);
    expect(sample(ch.fill, 0)).toBe(1);
    expect(sample(ch.settle, 0)).toBe(1);
    expect(sample(ch.title, 0)).toBe(0);
    expect(sample(ch.title, LAUNCH_SPLASH_TIMING.reducedTextDuration / ch.totalMs)).toBeCloseTo(1, 5);
  });

  it('reveal edges cover each whole wave inside the logo box', () => {
    const W = 200;
    SARH_LOGO_PATH_X_EXTENTS.forEach(([minX, maxX], i) => {
      const [from, to] = launchSplashDrawEdges(i, W, 611);
      expect(from).toBeGreaterThanOrEqual(0);
      expect(from).toBeLessThan((minX / 611) * W);
      expect(to).toBeGreaterThan((maxX / 611) * W);
      expect(to).toBeLessThanOrEqual(W);
    });
  });
});
