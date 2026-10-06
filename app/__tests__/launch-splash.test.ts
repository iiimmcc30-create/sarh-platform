import { readFileSync } from 'fs';
import path from 'path';
import {
  LAUNCH_LOGO_START_SCALE,
  LAUNCH_SPLASH_TIMING,
  SARH_LOGO_PATH_LENGTHS,
  launchSplashFallbackMs,
  launchSplashLayout,
  launchSplashTextCompleteMs,
  launchSplashTotalMs,
  shouldExitLaunchSplash,
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
    expect(splash).toContain('strokeDashoffset');
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
    expect(splash).not.toMatch(/overflow:\s*'hidden'/);
    expect(splash).not.toMatch(/width:\s*values\./);
  });
});
