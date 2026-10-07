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
     * Brand accent (Dark Mode) = the Sarh logo white (#FBFBFB, `SARH_LOGO_INK_DARK`),
     * mirroring Light's brand black so the identity is black & white in both
     * schemes. Anything drawn ON the accent (icons/labels on accent fills, switch
     * thumbs, badges) uses `onAction` (#020202, ≈ 20:1 on #FBFBFB). Pressed reuses
     * the white-CTA pressed tone; muted is the same white at low alpha.
     */
    action: '#FBFBFB',
    actionPressed: '#D7DBDC',
    actionMuted: 'rgba(251, 251, 251, 0.14)',
    /** Foreground on the dark accent (Sarh brand black). */
    onAction: '#020202',
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
    success: '#FBFBFB',
    /**
     * Former Dark brand green (#24A86C). Kept ONLY where white would lose its
     * meaning (online presence dot) — never for dark-mode actions.
     */
    darkStatusGreen: '#24A86C',
    /**
     * Light Mode primary = the Sarh brand black (#020202, the app-icon black and
     * the dark-mode CTA label), so the identity is black & white: light CTAs are
     * black pills with white text (white on #020202 ≈ 20.6:1). Pressed reuses the
     * existing raised dark surface; muted is the same black at low alpha.
     */
    lightAction: '#020202',
    lightActionPressed: '#16181C',
    lightActionMuted: 'rgba(2, 2, 2, 0.14)',
    lightSuccess: '#020202',
    /**
     * Former Light brand green (#1C8354 / #176B44). Kept ONLY for spots where
     * black would lose its meaning (online presence dot) or sit on a dark
     * surface (dark-mode plan card) — never for light-mode actions.
     */
    statusGreen: '#1C8354',
    statusGreenPressed: '#176B44',
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
