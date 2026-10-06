import { sarh } from '@/constants/sarhTokens';
import { colors, functional } from './colors';
import { elevation } from './elevation';
import { radius } from './radius';
import { space } from './spacing';
import { typography, type TypeRole } from './typography';

export type ButtonTone = {
  backgroundColor: string;
  borderColor: string;
  contentColor: string;
};

export type ButtonStateTokens = {
  default: ButtonTone;
  pressed: ButtonTone;
  disabled: ButtonTone;
};

export type ButtonVariantName = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse';

export type ButtonSizeName = 'sm' | 'md';

export type ButtonSizeMetrics = {
  minHeight: number;
  paddingHorizontal: number;
  icon: number;
  typeRole: TypeRole;
};

/** Layout metrics — shared by every SarhButton size, independent of color scheme. */
export const buttonMetrics = {
  gap: space[8],
  radius: radius[12],
  pillRadius: radius[999],
  borderWidth: 1,
  elevation: elevation.subtle,
  size: {
    sm: {
      minHeight: space[32],
      paddingHorizontal: space[16],
      icon: space[16],
      typeRole: 'label' as TypeRole,
    },
    md: {
      minHeight: space[48],
      paddingHorizontal: space[20],
      icon: space[20],
      typeRole: 'label' as TypeRole,
    },
  } satisfies Record<ButtonSizeName, ButtonSizeMetrics>,
} as const;

/** @deprecated Use `buttonMetrics.size` — kept for existing imports. */
export const BUTTON_SIZE = {
  sm: {
    minHeight: buttonMetrics.size.sm.minHeight,
    paddingHorizontal: buttonMetrics.size.sm.paddingHorizontal,
  },
  md: {
    minHeight: buttonMetrics.size.md.minHeight,
    paddingHorizontal: buttonMetrics.size.md.paddingHorizontal,
  },
} as const;

function tone(backgroundColor: string, contentColor: string, borderColor = backgroundColor): ButtonTone {
  return { backgroundColor, borderColor, contentColor };
}

function makeVariants(primary: ButtonStateTokens): Record<ButtonVariantName, ButtonStateTokens> {
  return {
    primary,
    secondary: {
      default: tone(colors.surface, colors.textPrimary, colors.borderStrong),
      pressed: tone(colors.surfaceElevated, colors.textPrimary, colors.borderStrong),
      disabled: tone(colors.surface, colors.textMuted, colors.border),
    },
    ghost: {
      default: tone('transparent', colors.primary, 'transparent'),
      pressed: tone('transparent', colors.primaryPressed, 'transparent'),
      disabled: tone('transparent', colors.textMuted, 'transparent'),
    },
    danger: {
      default: tone(colors.danger, functional.onPrimary),
      pressed: tone(colors.danger, functional.onPrimary),
      disabled: tone(colors.danger, functional.onPrimary),
    },
    inverse: {
      default: tone(functional.onPrimary, functional.onPrimaryInverse),
      pressed: tone(sarh.color.lightBorder, functional.onPrimaryInverse),
      disabled: tone(functional.onPrimary, functional.onPrimaryInverse),
    },
  };
}

function lightPrimary(): ButtonStateTokens {
  return {
    default: tone(colors.primary, functional.onPrimary),
    pressed: tone(colors.primaryPressed, functional.onPrimary),
    disabled: tone(colors.primary, functional.onPrimary),
  };
}

/** Dark disabled: low-contrast dark fill + muted label (no loud light grey, no opacity wash). */
const darkDisabled = (): ButtonTone =>
  tone(sarh.color.darkDisabledFill, sarh.color.darkDisabledText, sarh.color.darkDisabledFill);

/** Dark primary CTA: white pill, black label. */
function darkPrimary(): ButtonStateTokens {
  return {
    default: tone(sarh.color.primaryActionButton, sarh.color.primaryActionText),
    pressed: tone(sarh.color.primaryActionPressed, sarh.color.primaryActionText),
    disabled: darkDisabled(),
  };
}

/**
 * X-style dark button system — fixed tokens (independent of the live palette):
 * secondary/identity = dark pill + white label + thin subtle border,
 * primary/inverse = white pill + black label, every variant with a dark disabled tone.
 */
function darkVariants(): Record<ButtonVariantName, ButtonStateTokens> {
  const c = sarh.color;
  return {
    primary: darkPrimary(),
    secondary: {
      default: tone(c.darkPillButton, c.primaryText, c.darkPillBorder),
      pressed: tone(c.darkPillPressed, c.primaryText, c.darkPillBorder),
      disabled: tone(c.darkPillButton, c.darkDisabledText, c.darkBorder),
    },
    ghost: {
      default: tone('transparent', c.action, 'transparent'),
      pressed: tone('transparent', c.actionPressed, 'transparent'),
      disabled: tone('transparent', c.darkDisabledText, 'transparent'),
    },
    danger: {
      default: tone(c.danger, c.fab),
      pressed: tone(c.danger, c.fab),
      disabled: darkDisabled(),
    },
    inverse: darkPrimary(),
  };
}

function variantsForScheme(scheme: 'light' | 'dark'): Record<ButtonVariantName, ButtonStateTokens> {
  return scheme === 'dark' ? darkVariants() : makeVariants(lightPrimary());
}

/**
 * Live button palettes. Mutated by `applyButtonTokens` when the theme scheme changes.
 * Screens must not read hex here — only `SarhButton` / `resolveSarhButtonColors`.
 */
export const buttonColors: Record<ButtonVariantName, ButtonStateTokens> = darkVariants();

export function applyButtonTokens(scheme: 'light' | 'dark') {
  Object.assign(buttonColors, variantsForScheme(scheme));
}

export function resolveButtonTone(
  variant: ButtonVariantName,
  state: keyof ButtonStateTokens,
): ButtonTone {
  return buttonColors[variant][state];
}

/** Resolve tones for a scheme without mutating the live `buttonColors` singleton. */
export function resolveButtonToneForScheme(
  scheme: 'light' | 'dark',
  variant: ButtonVariantName,
  state: keyof ButtonStateTokens,
): ButtonTone {
  return variantsForScheme(scheme)[variant][state];
}
