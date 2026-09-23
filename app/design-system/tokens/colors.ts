import { sarh } from '@/constants/sarhTokens';

/**
 * Raw Sarh Dark palette — extracted from `sarh.color`.
 * Canonical dark hex for documentation and fallbacks. Runtime chrome reads `colors`,
 * which `applyDesignSystemColors` keeps in sync with the live theme.
 */
export const palette = {
  bg: sarh.color.bg,
  surface: sarh.color.surface,
  surfaceRaised: sarh.color.surfaceRaised,
  surfaceAlt: sarh.color.surfaceAlt,
  action: sarh.color.action,
  actionPressed: sarh.color.actionPressed,
  text: sarh.color.text,
  textSecondary: sarh.color.textSecondary,
  textMuted: sarh.color.textMuted,
  border: sarh.color.border,
  danger: sarh.color.danger,
  warning: sarh.color.warning,
  success: sarh.color.success,
} as const;

export type DesignSystemColorValues = {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceAlt: string;
  primary: string;
  primaryPressed: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderStrong: string;
  success: string;
  warning: string;
  danger: string;
};

export type DesignSystemFunctionalValues = {
  overlay: string;
  pattern: string;
  primaryMuted: string;
  onPrimary: string;
  onPrimaryInverse: string;
};

/**
 * Live semantic colors. Seeded from the dark palette, then overwritten when
 * `applyThemeScheme` runs so primitives follow Light/Dark.
 */
export const colors: DesignSystemColorValues = {
  background: palette.bg,
  surface: palette.surface,
  surfaceElevated: palette.surfaceRaised,
  surfaceAlt: palette.surfaceAlt,
  primary: palette.action,
  primaryPressed: palette.actionPressed,
  textPrimary: palette.text,
  textSecondary: palette.textSecondary,
  textMuted: palette.textMuted,
  border: palette.border,
  borderStrong: '#264556',
  success: palette.success,
  warning: palette.warning,
  danger: palette.danger,
};

export const functional: DesignSystemFunctionalValues = {
  overlay: sarh.color.overlay,
  pattern: sarh.color.pattern,
  primaryMuted: sarh.color.actionMuted,
  onPrimary: sarh.color.fab,
  onPrimaryInverse: sarh.color.fabIcon,
};

/** Keep DS primitives on the same palette `theme.ts` just applied. */
export function applyDesignSystemColors(
  next: DesignSystemColorValues,
  extras?: Partial<DesignSystemFunctionalValues>,
) {
  Object.assign(colors, next);
  if (extras) Object.assign(functional, extras);
}

export type ColorToken = keyof DesignSystemColorValues;
