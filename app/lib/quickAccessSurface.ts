import { resolveButtonToneForScheme, type ButtonTone } from '@/design-system/tokens/button';
import { HOME_QUICK_ACCESS_CHIP_VARIANT } from '@/lib/homeQuickAccess';

/**
 * Shared "quick access" surface: the exact background / border / content colours of
 * the Home quick-access chips (SarhButton `secondary`, same as the profile pills).
 * Market filter chips and listing cards read their idle colours from here so they
 * follow the same tokens in Light and Dark. Colours only — no metrics live here.
 */
export function resolveQuickAccessSurface(
  scheme: 'light' | 'dark',
  pressed = false,
): ButtonTone {
  return resolveButtonToneForScheme(scheme, HOME_QUICK_ACCESS_CHIP_VARIANT, pressed ? 'pressed' : 'default');
}
