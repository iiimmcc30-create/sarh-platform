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
/** Circular outline back button (kept at 40; only the Share / Edit pills grew). */
export const PROFILE_BACK_BUTTON_SIZE = 40;
export const PROFILE_BACK_LABEL = 'رجوع';
export const PROFILE_EDIT_LABEL = 'تعديل الملفّ الشخصيّ';
/** My Profile share pill: shares the profile link (sarhProfileShareUrl). */
export const PROFILE_SHARE_LABEL = 'مشاركة الملف الشخصي';
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