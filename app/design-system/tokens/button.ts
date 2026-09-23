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

function darkPrimary(): ButtonStateTokens {
  return {
    default: tone(functional.onPrimary, functional.onPrimaryInverse),
    pressed: tone(sarh.color.lightBorder, functional.onPrimaryInverse),
    disabled: tone(functional.onPrimary, functional.onPrimaryInverse),
  };
}

/**
 * Live button palettes. Mutated by `applyButtonTokens` when the theme scheme changes.
 * Screens must not read hex here — only `SarhButton` / `resolveSarhButtonColors`.
 */
export const buttonColors: Record<ButtonVariantName, ButtonStateTokens> = makeVariants(darkPrimary());

export function applyButtonTokens(scheme: 'light' | 'dark') {
  Object.assign(buttonColors, makeVariants(scheme === 'dark' ? darkPrimary() : lightPrimary()));
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
  const variants = makeVariants(scheme === 'dark' ? darkPrimary() : lightPrimary());
  return variants[variant][state];
}
