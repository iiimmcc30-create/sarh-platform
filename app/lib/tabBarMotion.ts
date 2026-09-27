/**
 * Bottom tab icon motion (React Native Animated, native driver).
 * Only transform + opacity are animated so the bar/slot layout never changes.
 * No horizontal translation, so the motion is direction-agnostic (RTL-safe).
 */
export const TAB_PRESS_SCALE = 0.9;
export const TAB_PRESS_OPACITY = 0.82;
/** Light pop when a tab becomes active - timing only, no spring/bounce. */
export const TAB_ACTIVATE_SCALE = 1.06;
export const TAB_PRESS_IN_MS = 90;
export const TAB_PRESS_OUT_MS = 160;

/** Every style key the tab glyph animates. Layout keys are never animated. */
export const TAB_GLYPH_ANIMATED_STYLE_KEYS = ['opacity', 'transform'] as const;

const LAYOUT_STYLE_KEY =
  /^(width|height|min|max|margin|padding|top|bottom|left|right|start|end|flex|gap|position|border)/;

export function isLayoutStyleKey(key: string): boolean {
  return LAYOUT_STYLE_KEY.test(key);
}