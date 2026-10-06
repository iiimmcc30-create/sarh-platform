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
    /**
     * Dark Mode — X-style neutrals anchored on the app-icon black (#020202).
     * Background -> secondary surface (barely lifted) -> elevated, hairline borders.
     */
    bg: '#020202',
    surface: '#0A0B0C',
    surfaceRaised: '#16181C',
    surfaceAlt: '#1D1F23',
    /**
     * Brand accent (Dark Mode). Same hue as the Light primary (#1C8354) but
     * lighter so text/links reach >= 4.5:1 on every dark surface
     * (#020202 6.82 · #0A0B0C 6.47 · #16181C 5.81 · #1D1F23 5.39).
     */
    action: '#24A86C',
    actionPressed: '#1D8958',
    actionMuted: 'rgba(36, 168, 108, 0.14)',
    text: '#E7E9EA',
    textSecondary: '#71767B',
    textMuted: '#5E6368',
    border: '#2F3336',
    borderStrong: '#3E4144',
    pattern: '#16181C',
    fab: '#FFFFFF',
    fabIcon: '#020202',
    overlay: 'rgba(2, 2, 2, 0.88)',
    /** X-style dark aliases — the names the dark UI / button system reads. */
    darkBackground: '#020202',
    darkSurface: '#0A0B0C',
    darkSurfaceElevated: '#16181C',
    darkBorder: '#2F3336',
    primaryText: '#E7E9EA',
    secondaryText: '#71767B',
    /** Secondary / identity pill (Edit profile, Following, Message). */
    darkPillButton: '#020202',
    darkPillBorder: '#536471',
    darkPillPressed: '#16181C',
    /** Primary CTA in dark: white pill, black label. */
    primaryActionButton: '#FFFFFF',
    primaryActionText: '#020202',
    primaryActionPressed: '#D7DBDC',
    /** Disabled in dark: low-contrast dark fill, never a loud light grey. */
    darkDisabledFill: '#202327',
    darkDisabledText: '#5E6368',
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
