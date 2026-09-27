/**
 * Profile header chrome - pure values (no React Native imports).
 * Back sits where the old pencil was; Share + Edit are equal outline pills
 * above the tabs strip (X-style). Colors come from the DS secondary button.
 */
export const PROFILE_ACTION_PILL_HEIGHT = 40;
/** Space between the two pills (DS space[12]). */
export const PROFILE_ACTION_PILL_GAP = 12;
export const PROFILE_ACTION_PILL_VARIANT = 'secondary' as const;
export const PROFILE_ACTION_PILL_SHAPE = 'pill' as const;
/** Circular outline back button, same height as the pills. */
export const PROFILE_BACK_BUTTON_SIZE = 40;
export const PROFILE_BACK_LABEL = 'رجوع';
export const PROFILE_EDIT_LABEL = 'تعديل الملفّ الشخصيّ';
/** Existing edit profile route (unchanged). */
export const PROFILE_EDIT_ROUTE = '/profile/edit';
/** Where Back lands when there is no history (deep link / cold start). */
export const PROFILE_BACK_FALLBACK_ROUTE = '/(tabs)';

export type ProfileBackAction = { kind: 'back' } | { kind: 'replace'; href: string };

export function resolveProfileBack(canGoBack: boolean): ProfileBackAction {
  return canGoBack ? { kind: 'back' } : { kind: 'replace', href: PROFILE_BACK_FALLBACK_ROUTE };
}