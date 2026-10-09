// SAFAT — Story ring + X-style avatar hairline tokens.
//
// The unseen story ring is the ONE place the app draws a gradient on purpose
// (explicit user request, Oct 2026): a TikTok-style blue → green ring. Colours
// were sampled with PIL from the user's reference screenshot and are identical
// in Dark and Light. Everything else around it (gap, seen ring, hairline)
// follows the theme.

import type { ColorScheme } from './theme';

/** Unseen ring gradient stops, top-left (blue) → bottom-right (green). Same in Dark & Light. */
export const STORY_RING_GRADIENT = [
  { offset: 0, color: '#11A9EA' },
  { offset: 0.5, color: '#26D4DE' },
  { offset: 1, color: '#13EFA5' },
] as const;

/** Reference ring stroke ≈ 3.9% of the ring diameter (36px of a 934px ring). */
export const STORY_RING_STROKE_RATIO = 0.04;

/** Seen stories: thin subtle ring in the theme grey `borderSoft` (Dark #2F3336 / Light #E6E8EB). */
export const STORY_RING_SEEN_STROKE = 1.5;

/** Unseen ring stroke for a ring of `size` px (quarter-pixel steps, never below 2). */
export function storyRingStroke(size: number): number {
  return Math.max(2, Math.round(size * STORY_RING_STROKE_RATIO * 4) / 4);
}

/**
 * X-style avatar edge: no white ring, just a barely-there hairline so a dark
 * photo doesn't melt into the page (white 10% in Dark, black 7% in Light).
 */
export const AVATAR_HAIRLINE = {
  dark: 'rgba(255,255,255,0.10)',
  light: 'rgba(0,0,0,0.07)',
} as const;

export function avatarHairlineColor(scheme: ColorScheme): string {
  return scheme === 'dark' ? AVATAR_HAIRLINE.dark : AVATAR_HAIRLINE.light;
}
