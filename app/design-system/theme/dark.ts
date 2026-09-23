import {
  colors,
  duration,
  elevation,
  fontFamily,
  functional,
  motion,
  radius,
  space,
  typography,
} from '../tokens';

/**
 * Live nested aliases of the runtime `colors` object.
 *
 * These are getters, not an `as const` snapshot. `applyThemeScheme` mutates
 * `colors` in place; reading `semantic.background` after a Light/Dark toggle
 * must return the new value. Do not freeze this object.
 */
export const semantic = {
  get background() {
    return colors.background;
  },
  get surface() {
    return colors.surface;
  },
  get surfaceElevated() {
    return colors.surfaceElevated;
  },
  get surfaceAlt() {
    return colors.surfaceAlt;
  },
  text: {
    get primary() {
      return colors.textPrimary;
    },
    get secondary() {
      return colors.textSecondary;
    },
    get muted() {
      return colors.textMuted;
    },
  },
  action: {
    get primary() {
      return colors.primary;
    },
    get primaryPressed() {
      return colors.primaryPressed;
    },
  },
  border: {
    get default() {
      return colors.border;
    },
    get strong() {
      return colors.borderStrong;
    },
  },
  status: {
    get success() {
      return colors.success;
    },
    get warning() {
      return colors.warning;
    },
    get danger() {
      return colors.danger;
    },
  },
};

/**
 * Live theme bag — `scheme` is not stored here. Read
 * `getActiveScheme()` from `@/constants/theme` for the current scheme.
 * `colors` / `functional` / `semantic` all follow `applyThemeScheme`.
 */
export const theme = {
  colors,
  semantic,
  functional,
  typography,
  fontFamily,
  space,
  radius,
  elevation,
  motion,
  duration,
};

export type Theme = typeof theme;
