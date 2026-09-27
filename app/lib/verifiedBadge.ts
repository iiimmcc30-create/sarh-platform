/**
 * Verified badge metrics shared with the Feed (PostItem name row uses
 * `<VerificationBadge size={14} />` inside a centred row with `gap: 4`).
 */
export const FEED_VERIFIED_BADGE_SIZE = 14;
/** About one character of space between the name and the badge (logical gap, RTL-safe). */
export const VERIFIED_BADGE_GAP = 4;

/** Only an explicit `verified === true` shows the badge (backend value is used as-is). */
export function shouldShowVerifiedBadge(verified: unknown): boolean {
  return verified === true;
}

/** Sidebar header: badge only for a signed-in user whose existing `verified` field is true. */
export function sidebarShowsVerifiedBadge(isAuthenticated: boolean, verified: unknown): boolean {
  return isAuthenticated && shouldShowVerifiedBadge(verified);
}