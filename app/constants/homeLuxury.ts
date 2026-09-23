import { sarh } from './sarhTokens';

/** Dark luxury aliases — sourced from sarhTokens for a single source of truth. */
export const luxuryDark = {
  bg: sarh.color.bg,
  card: sarh.color.surface,
  surface: sarh.color.surfaceRaised,
  surfaceAlt: sarh.color.surfaceAlt,
  border: sarh.color.border,
  textPrimary: sarh.color.text,
  textSecondary: sarh.color.textSecondary,
  textMuted: sarh.color.textMuted,
  accent: sarh.color.action,
  accentPressed: sarh.color.actionPressed,
  accentSoft: sarh.color.actionMuted,
  accentGlow: 'rgba(32, 182, 111, 0.22)',
  radius: sarh.radius.card,
  tabGlass: sarh.color.overlay,
} as const;
