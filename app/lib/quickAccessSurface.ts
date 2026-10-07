import { sarh } from '@/constants/sarhTokens';
import { resolveButtonToneForScheme, type ButtonTone } from '@/design-system/tokens/button';
import { HOME_QUICK_ACCESS_CHIP_VARIANT } from '@/lib/homeQuickAccess';

/**
 * Subtle chip border: the theme hairline (#E6E8EB light / #2F3336 dark), softer than
 * the SarhButton `secondary` border (#DDE1E6 / #536471) the profile pills keep.
 */
export function quickAccessBorderColor(scheme: 'light' | 'dark'): string {
  return scheme === 'dark' ? sarh.color.darkBorder : sarh.color.lightBorder;
}

/**
 * Shared "quick access" surface: Home quick-access chips, market filter chips and
 * listing-card surfaces. Background + content come from SarhButton `secondary`
 * (same as the profile Share / Edit pills); the border is the softer hairline above
 * so quick access and filter chips stay identical. Colours only — no metrics here.
 */
export function resolveQuickAccessSurface(
  scheme: 'light' | 'dark',
  pressed = false,
): ButtonTone {
  const tone = resolveButtonToneForScheme(
    scheme,
    HOME_QUICK_ACCESS_CHIP_VARIANT,
    pressed ? 'pressed' : 'default',
  );
  return { ...tone, borderColor: quickAccessBorderColor(scheme) };
}
