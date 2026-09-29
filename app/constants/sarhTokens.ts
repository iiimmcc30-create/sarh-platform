/**
 * Sarh Premium Design System — unified visual tokens
 * Background → Surface → Elevated · Accent reserved for actions
 *
 * Light palette lives primarily in `theme.ts` / `designSystem.ts` (`ds.light`).
 * `sarh.color` remains the dark canonical surface set used by many screens.
 *
 * New work should import semantic tokens from `@/design-system` (foundation only).
 * This file stays the live source of hex values — do not delete or replace it.
 */
export const sarh = {
  color: {
    /** Dark Mode — deep cinematic neutrals (not pure black) */
    bg: '#07131C',
    surface: '#0C1C27',
    surfaceRaised: '#102633',
    surfaceAlt: '#142C3A',
    /**
     * Brand accent (Dark Mode). Same hue as the Light primary (#1C8354) but
     * lighter so text/links reach >= 4.5:1 on every dark surface
     * (#07131C 6.16 · #0C1C27 5.69 · #102633 5.12 · #142C3A 4.75).
     */
    action: '#24A86C',
    actionPressed: '#1D8958',
    actionMuted: 'rgba(36, 168, 108, 0.14)',
    text: '#F4F7F9',
    textSecondary: '#94A6B2',
    textMuted: '#657985',
    border: '#1B3442',
    pattern: '#1E3A4A',
    fab: '#FFFFFF',
    fabIcon: '#07131C',
    overlay: 'rgba(7, 19, 28, 0.88)',
    danger: '#E85D5D',
    warning: '#D4A017',
    success: '#24A86C',
    /**
     * Light Mode brand primary — #1C8354 (rgb 28,131,84), taken from the
     * reference image. White text on it measures 4.75:1 (WCAG AA).
     * Pressed / muted shades are derived from it (same hue).
     */
    lightAction: '#1C8354',
    lightActionPressed: '#176B44',
    lightActionMuted: 'rgba(28, 131, 84, 0.14)',
    lightSuccess: '#1C8354',
    /** Light Mode mirrors (for screens that read sarh.color directly) */
    lightBg: '#F8F9FA',
    lightSurface: '#FFFFFF',
    lightElevated: '#FFFFFF',
    lightField: '#F1F3F5',
    lightChip: '#F3F4F5',
    lightBorder: '#E6E8EB',
    lightText: '#101820',
    lightTextSecondary: '#65727D',
    lightTextMuted: '#8D99A3',
  },
  /** Spacing grid: 4 / 8 / 12 / 16 / 20 / 24 / 32 */
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  /** Radius scale: 8 / 12 / 16 / 20 */
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    card: 16,
    pill: 999,
    fab: 16,
  },
  pattern: {
    opacity: 0.06,
  },
} as const;

export type SarhTokens = typeof sarh;
