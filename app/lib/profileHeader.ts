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
/** Back and more only: +3pt. The glass capsule stays 36. */
export const PROFILE_COVER_NAV_GLYPH = PROFILE_COVER_ICON_GLYPH + 3;
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
/**
 * Status-bar content over the full-bleed cover. A cover photo stays behind the status bar
 * the whole time (sharp at rest, then the blurred, dark-tinted sticky header) → light.
 * A plain band / theme-surface header follows the theme.
 */
export function profileStatusBarStyle(input: {
  hasCoverImage: boolean;
  isDark: boolean;
  /** Sticky header collapsed (kept for call sites; the header now carries the cover). */
  tabsPinned: boolean;
}): 'light' | 'dark' {
  if (input.isDark) return 'light';
  return input.hasCoverImage ? 'light' : 'dark';
}

/**
 * X-style sticky profile header: back / more and (once scrolled) name + posts count over
 * the user's cover, blurred and dark-tinted. Height below the top inset; the 36pt glass
 * controls get 6pt above and below.
 */
export const PROFILE_STICKY_BAR_HEIGHT = PROFILE_COVER_ICON_BUTTON_SIZE + 12;
/** expo-image blurRadius for the frosted cover (no expo-blur dependency). */
export const PROFILE_STICKY_BLUR_RADIUS = 24;
/** Scroll distance over which the collapsed cover frosts (blur + tint fade in). */
export const PROFILE_STICKY_BLUR_RANGE = 48;
/** Max opacity of the DS overlay scrim on the frosted cover (white text stays legible on any photo). */
export const PROFILE_STICKY_TINT_OPACITY = 0.45;

/**
 * Scroll offsets that drive the sticky header.
 * - `collapseAt`: the content cover's bottom edge reaches the header's bottom edge; from
 *   here the header shows the same cover crop (seamless), so the cover "collapses" into it.
 * - `blurEnd`: fully frosted.
 * - `titleAt`: the profile name has scrolled under the header → name + count fade in.
 */
export function profileStickyHeaderRanges(input: {
  topInset: number;
  coverHeight: number;
  /** Content offset of the bottom of the name block, when measured. */
  nameBottom: number | null;
}): { headerHeight: number; coverFull: number; collapseAt: number; blurEnd: number; titleAt: number } {
  const headerHeight = input.topInset + PROFILE_STICKY_BAR_HEIGHT;
  const coverFull = input.coverHeight + input.topInset;
  const collapseAt = Math.max(0, coverFull - headerHeight);
  const blurEnd = collapseAt + PROFILE_STICKY_BLUR_RANGE;
  const titleAt = Math.max(blurEnd, (input.nameBottom ?? coverFull + 96) - headerHeight);
  return { headerHeight, coverFull, collapseAt, blurEnd, titleAt };
}

/**
 * Sticky tabs vs. the sticky header: once the tabs reach the header's bottom edge they pin
 * with a spacer of that height (pass the header height as `topInset`) so they sit right
 * under the frosted header and never slide beneath it.
 * `tabsTop` is the tabs strip's natural content offset (without the spacer).
 */
export function shouldPinProfileTabs(scrollY: number, tabsTop: number | null, topInset: number): boolean {
  if (tabsTop == null || topInset <= 0) return false;
  return scrollY >= tabsTop - topInset;
}
