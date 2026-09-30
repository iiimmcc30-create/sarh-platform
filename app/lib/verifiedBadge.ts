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

/** Verification badge tiers (Blue = individuals/sellers, Gold = merchants). */
export type VerifiedTier = 'blue' | 'gold';

/** Badge fills. Blue is the existing badge colour; gold is the merchant tier. */
export const VERIFIED_BADGE_COLORS: Record<VerifiedTier, string> = {
  blue: '#1D9BF0',
  gold: '#C9A227',
};

/**
 * Tier used for the badge colour. Only an explicit "gold" is gold; anything
 * else (including legacy verified users with no tier) keeps the blue badge.
 */
export function resolveVerifiedTier(tier: unknown): VerifiedTier {
  return tier === 'gold' ? 'gold' : 'blue';
}

export function verifiedBadgeColor(tier: unknown): string {
  return VERIFIED_BADGE_COLORS[resolveVerifiedTier(tier)];
}
