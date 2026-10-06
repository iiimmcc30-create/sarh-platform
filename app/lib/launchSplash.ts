/**
 * Pure timing / sizing for the in-app launch splash (`components/ui/LaunchSplash.tsx`).
 * Kept free of React Native imports so it can be unit-tested.
 */

/** Path lengths (viewBox units) of `SARH_LOGO_MARK_PATHS`: bottom wave, top wave. */
export const SARH_LOGO_PATH_LENGTHS = [1496, 1149] as const;

/** Calm launch timeline (ms). Total before the exit fade ≈ 2.5 s. */
export const LAUNCH_SPLASH_TIMING = {
  /** Per-path stroke draw: [delay, duration] for bottom wave, top wave. */
  draw: [
    [0, 820],
    [100, 800],
  ] as const,
  /** Fill fades in as the outline completes. */
  fillDelay: 700,
  fillDuration: 340,
  /** Large → final size. */
  settleDelay: 960,
  settleDuration: 480,
  /** «سرح» then «Sarh» (opacity + small rise only — no width mask). */
  titleDelay: 1220,
  subtitleDelay: 1360,
  textDuration: 420,
  /** Full mark + both words stay fully visible before leaving. */
  holdAfter: 700,
  /** Exit cross-fade to the routed screen. */
  exitDuration: 320,
  /** Reduce motion: no drawing / scaling, quick text fade only. */
  reducedTextDuration: 280,
  reducedHold: 700,
  /** Extra margin on top of the intro before the safety fallback may end it. */
  fallbackMargin: 1500,
} as const;

/** Logo starts this much larger, then settles to 1 (no bounce). */
export const LAUNCH_LOGO_START_SCALE = 1.32;

export function launchSplashTotalMs(reduceMotion: boolean): number {
  const t = LAUNCH_SPLASH_TIMING;
  if (reduceMotion) return t.reducedTextDuration + t.reducedHold;
  return t.subtitleDelay + t.textDuration + t.holdAfter;
}

/** Safety net only (interrupted animation): always longer than intro + hold. */
export function launchSplashFallbackMs(reduceMotion: boolean): number {
  return launchSplashTotalMs(reduceMotion) + LAUNCH_SPLASH_TIMING.fallbackMargin;
}

/** Moment both words are fully visible (before the hold). */
export function launchSplashTextCompleteMs(): number {
  const t = LAUNCH_SPLASH_TIMING;
  return Math.max(t.titleDelay, t.subtitleDelay) + t.textDuration;
}

export type LaunchSplashLayout = {
  logoWidth: number;
  logoHeight: number;
  titleSize: number;
  titleLineHeight: number;
  subtitleSize: number;
  subtitleLineHeight: number;
  /** Space between the mark and «سرح». */
  logoGap: number;
  /** Space between «سرح» and «Sarh». */
  textGap: number;
};

/**
 * Sizes from the window only (percentages of the short side, capped by height)
 * so the group stays centered on small, tall and tablet screens.
 */
export function launchSplashLayout(
  windowWidth: number,
  windowHeight: number,
  logoAspect: number,
): LaunchSplashLayout {
  const w = Math.max(1, windowWidth);
  const h = Math.max(1, windowHeight);
  const short = Math.min(w, h);
  const logoWidth = Math.round(Math.min(short * 0.38, h * 0.24, 260));
  const logoHeight = Math.round(logoWidth / logoAspect);
  const titleSize = Math.round(Math.min(Math.max(logoWidth * 0.3, 30), 64));
  const subtitleSize = Math.round(Math.max(titleSize * 0.4, 13));
  return {
    logoWidth,
    logoHeight,
    titleSize,
    titleLineHeight: Math.round(titleSize * 1.4),
    subtitleSize,
    subtitleLineHeight: Math.round(subtitleSize * 1.4),
    logoGap: Math.round(logoHeight * 0.3),
    textGap: Math.round(subtitleSize * 0.15),
  };
}

/** Exit only after the animation finished AND boot (fonts/auth/onboarding or timeout) is ready. */
export function shouldExitLaunchSplash(input: { animationDone: boolean; bootReady: boolean }): boolean {
  return input.animationDone && input.bootReady;
}
