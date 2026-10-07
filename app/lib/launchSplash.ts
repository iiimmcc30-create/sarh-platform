/**
 * Pure timing / sizing for the in-app launch splash (`components/ui/LaunchSplash.tsx`).
 * Kept free of React Native imports so it can be unit-tested.
 */

/** Path lengths (viewBox units) of `SARH_LOGO_MARK_PATHS`: bottom wave, top wave. */
export const SARH_LOGO_PATH_LENGTHS = [1496, 1149] as const;

/** Horizontal extent [minX, maxX] (viewBox units) of each wave: bottom, top. */
export const SARH_LOGO_PATH_X_EXTENTS = [
  [8, 603.2],
  [32.9, 474.5],
] as const;

/** Viewbox units added on both sides of a wave so the outline stroke is never cut. */
export const SARH_LOGO_DRAW_PAD = 6;

/**
 * Quick launch timeline (ms), iOS-style: intro ≈ 1.36 s + 0.24 s exit ≈ 1.6 s in total.
 * Logo only; the title/subtitle slots stay on the timeline as no-op channels.
 */
export const LAUNCH_SPLASH_TIMING = {
  /** Per-path stroke draw: [delay, duration] for bottom wave, top wave. */
  draw: [
    [0, 560],
    [70, 540],
  ] as const,
  /** Fill fades in as the outline completes. */
  fillDelay: 470,
  fillDuration: 260,
  /** Large → final size. */
  settleDelay: 600,
  settleDuration: 400,
  /** Legacy text slots (logo only now) — kept so the timeline shape stays stable. */
  titleDelay: 760,
  subtitleDelay: 840,
  textDuration: 300,
  /** Settled mark stays fully visible briefly before leaving. */
  holdAfter: 220,
  /** Exit cross-fade to the routed screen. */
  exitDuration: 240,
  /** Reduce motion: no drawing / scaling, quick fade only. */
  reducedTextDuration: 240,
  reducedHold: 500,
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

/*
 * Native-driven timeline.
 *
 * The whole intro runs from ONE Animated.Value (0 → 1, linear, useNativeDriver: true).
 * Every channel below is an interpolation of it, so the logo keeps drawing on the UI
 * thread while the JS thread is busy mounting the app (auth restore, routing, first
 * screen). Native interpolation has no `easing`, so curves are sampled into points,
 * and there are no `delay`s (those are JS timers).
 */

export type EasingFn = (t: number) => number;

export const easeOutCubic: EasingFn = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic: EasingFn = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export type TimelineRange = { inputRange: number[]; outputRange: number[] };

/** Points per eased segment — smooth at 60/120 Hz, still tiny for the native node. */
export const TIMELINE_SAMPLES = 16;

/**
 * One sub-animation on the shared 0→1 timeline: holds `from` until `startMs`, eases to
 * `to` over `durationMs`, then holds `to`. Input range is strictly increasing.
 */
export function timelineSegment(input: {
  startMs: number;
  durationMs: number;
  totalMs: number;
  from?: number;
  to?: number;
  easing?: EasingFn;
  samples?: number;
}): TimelineRange {
  const { startMs, durationMs, totalMs, from = 0, to = 1, easing = (t) => t } = input;
  const samples = Math.max(1, Math.round(input.samples ?? TIMELINE_SAMPLES));
  const total = Math.max(1, totalMs);
  const s = Math.min(Math.max(startMs / total, 0), 1);
  const e = Math.min(Math.max((startMs + Math.max(0, durationMs)) / total, s), 1);
  if (e <= s) {
    // Instant (or empty) segment: already at its end value.
    return { inputRange: [0, 1], outputRange: [to, to] };
  }
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  if (s > 0) {
    inputRange.push(0);
    outputRange.push(from);
  }
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    inputRange.push(s + (e - s) * t);
    outputRange.push(from + (to - from) * easing(t));
  }
  if (e < 1) {
    inputRange.push(1);
    outputRange.push(to);
  }
  return { inputRange, outputRange };
}

/** Re-maps a 0→1 channel onto real units (px, scale…) without another node. */
export function mapTimelineRange(range: TimelineRange, from: number, to: number): TimelineRange {
  return {
    inputRange: range.inputRange,
    outputRange: range.outputRange.map((v) => from + (to - from) * v),
  };
}

export type LaunchSplashChannels = {
  totalMs: number;
  /** Per wave (bottom, top): 0 = hidden, 1 = outline fully drawn. */
  draw: TimelineRange[];
  /** Fill fades in while the outline fades out. */
  fill: TimelineRange;
  /** Large → final size / position. */
  settle: TimelineRange;
  title: TimelineRange;
  subtitle: TimelineRange;
};

/** All channels of the intro as 0→1 ranges on the shared timeline. */
export function launchSplashChannels(reduceMotion: boolean): LaunchSplashChannels {
  const t = LAUNCH_SPLASH_TIMING;
  const totalMs = launchSplashTotalMs(reduceMotion);
  const done: TimelineRange = { inputRange: [0, 1], outputRange: [1, 1] };
  if (reduceMotion) {
    const text = timelineSegment({ startMs: 0, durationMs: t.reducedTextDuration, totalMs });
    return {
      totalMs,
      draw: SARH_LOGO_PATH_LENGTHS.map(() => done),
      fill: done,
      settle: done,
      title: text,
      subtitle: text,
    };
  }
  return {
    totalMs,
    draw: t.draw.map(([startMs, durationMs]) =>
      timelineSegment({ startMs, durationMs, totalMs, easing: easeInOutCubic }),
    ),
    fill: timelineSegment({ startMs: t.fillDelay, durationMs: t.fillDuration, totalMs, easing: easeOutCubic }),
    settle: timelineSegment({
      startMs: t.settleDelay,
      durationMs: t.settleDuration,
      totalMs,
      easing: easeOutCubic,
    }),
    title: timelineSegment({ startMs: t.titleDelay, durationMs: t.textDuration, totalMs, easing: easeOutCubic }),
    subtitle: timelineSegment({
      startMs: t.subtitleDelay,
      durationMs: t.textDuration,
      totalMs,
      easing: easeOutCubic,
    }),
  };
}

/**
 * Left → right reveal edge (layout px inside the logo box) for wave `index`: from just
 * before the wave starts to just after it ends. Same direction the old stroke draw began.
 */
export function launchSplashDrawEdges(index: number, logoWidth: number, viewBoxWidth: number): [number, number] {
  const k = logoWidth / Math.max(1, viewBoxWidth);
  const [minX, maxX] = SARH_LOGO_PATH_X_EXTENTS[index] ?? [0, viewBoxWidth];
  return [
    Math.max(0, (minX - SARH_LOGO_DRAW_PAD) * k),
    Math.min(logoWidth, (maxX + SARH_LOGO_DRAW_PAD) * k),
  ];
}
