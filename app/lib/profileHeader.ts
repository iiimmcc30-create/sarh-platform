/**
 * Profile header chrome - pure values (no React Native imports).
 * Back sits where the old pencil was; Share + Edit are equal outline pills
 * above the tabs strip (X-style). Colors come from the DS secondary button.
 */
/** 40 → 44: slightly larger pills for a calmer, more premium header. */
export const PROFILE_ACTION_PILL_HEIGHT = 44;
/** Space between the two pills (DS space[12]). */
export const PROFILE_ACTION_PILL_GAP = 12;
export const PROFILE_ACTION_PILL_VARIANT = 'secondary' as const;
export const PROFILE_ACTION_PILL_SHAPE = 'pill' as const;
/**
 * Cover controls (back / more): glass circles one size step smaller than before
 * (back 40 / more 48 → 36, glyph 20 → 18). The hit area stays ≥ 44 via hitSlop.
 */
export const PROFILE_COVER_ICON_BUTTON_SIZE = 36;
export const PROFILE_COVER_ICON_GLYPH = 18;
/** Smallest hitSlop the DS icon buttons apply (SarhIconButton: space[4]). */
export const PROFILE_COVER_ICON_MIN_HIT_SLOP = 4;
export const PROFILE_COVER_ICON_HIT_AREA = PROFILE_COVER_ICON_BUTTON_SIZE + 2 * PROFILE_COVER_ICON_MIN_HIT_SLOP;
/** Back button = cover control size. */
export const PROFILE_BACK_BUTTON_SIZE = PROFILE_COVER_ICON_BUTTON_SIZE;
export const PROFILE_BACK_LABEL = 'رجوع';
export const PROFILE_EDIT_LABEL = 'تعديل الملفّ الشخصيّ';
/** My Profile share pill: shares the profile link (sarhProfileShareUrl). */
export const PROFILE_SHARE_LABEL = 'مشاركة الملف';
/**
 * Profile stats (followers / following / posts): one compact block the SIZE of
 * the «تعديل الملف الشخصي» pill (not its shape): same 44 height and the same
 * width rule as a pill in the two-pill row (half the row minus half the gap),
 * pinned to the inline start (right in Arabic).
 */
export const PROFILE_STATS_HEIGHT = PROFILE_ACTION_PILL_HEIGHT;
/** Pill side padding (8 → 10): still tight enough that both long labels fit on one line on narrow phones. */
export const PROFILE_ACTION_PILL_PADDING_H = 10;
/** Existing edit profile route (unchanged). */
export const PROFILE_EDIT_ROUTE = '/profile/edit';
/** Where Back lands when there is no history (deep link / cold start). */
export const PROFILE_BACK_FALLBACK_ROUTE = '/(tabs)';

export type ProfileBackAction = { kind: 'back' } | { kind: 'replace'; href: string };

export function resolveProfileBack(canGoBack: boolean): ProfileBackAction {
  return canGoBack ? { kind: 'back' } : { kind: 'replace', href: PROFILE_BACK_FALLBACK_ROUTE };
}
/** Status-bar content over the full-bleed cover (photo → light; plain band follows the theme). */
export function profileStatusBarStyle(input: {
  hasCoverImage: boolean;
  isDark: boolean;
  /** Sticky tabs pinned under the status bar (opaque tab-bar surface behind it). */
  tabsPinned: boolean;
}): 'light' | 'dark' {
  if (input.isDark) return 'light';
  if (input.tabsPinned) return 'dark';
  return input.hasCoverImage ? 'light' : 'dark';
}

/**
 * Sticky tabs vs. the top inset: once the tabs reach the status bar they pin with a
 * top-inset spacer (tab-bar surface) so they never slide under the status bar.
 * `tabsTop` is the tabs strip's natural content offset (without the spacer).
 */
export function shouldPinProfileTabs(scrollY: number, tabsTop: number | null, topInset: number): boolean {
  if (tabsTop == null || topInset <= 0) return false;
  return scrollY >= tabsTop - topInset;
}
