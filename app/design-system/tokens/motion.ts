/**
 * Semantic motion — single source of truth for React Native Animated / LayoutAnimation.
 * Compatibility aliases (`fast`, `normal`, `pressScale`) keep existing call sites working.
 */
const PRESS_MS = 120;
const UI_MS = 200;

export const duration = {
  instant: 0,
  press: PRESS_MS,
  ui: UI_MS,
  screen: 280,
  sheet: 320,
  slow: 360,
  /** Auth error shake tick — 50/55/60ms were the same gesture, not `press`. */
  shake: 50,
  /** @deprecated alias of `press` */
  fast: PRESS_MS,
  /** @deprecated alias of `ui` */
  normal: UI_MS,
} as const;

export const easing = {
  out: 'ease-out' as const,
  inOut: 'ease-in-out' as const,
};

export const spring = {
  snappy: {
    damping: 18,
    stiffness: 240,
    mass: 0.8,
  },
  sheet: {
    tension: 68,
    friction: 11,
  },
  success: {
    tension: 80,
    friction: 6,
  },
} as const;

export const opacity = {
  disabled: 0.45,
  pressed: 0.88,
} as const;

export const press = {
  scale: 0.97,
  opacity: 0.88,
  opacityCard: 0.92,
} as const;

export const motion = {
  duration,
  easing,
  spring,
  opacity,
  press,
  /** @deprecated alias of `press.scale` */
  pressScale: press.scale,
} as const;

export type DurationToken = keyof typeof duration;
