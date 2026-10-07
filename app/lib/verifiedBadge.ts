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

/*
 * X-style verified seal: a scalloped rosette (8 rounded lobes, soft inward notches)
 * with a check mark, drawn in a 24×24 viewBox. Generated once (pure, no RN imports).
 */
export const VERIFIED_SEAL_VIEWBOX = 24;
export const VERIFIED_SEAL_LOBES = 8;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Closed seal outline: r(θ) = inner + depth·|cos(lobes·θ/2)|^0.6, centred at 12,12. */
export function buildVerifiedSealPath(
  lobes: number = VERIFIED_SEAL_LOBES,
  inner = 9.3,
  depth = 1.95,
  samples = 144,
): string {
  const c = VERIFIED_SEAL_VIEWBOX / 2;
  const pts: string[] = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    const r = inner + depth * Math.pow(Math.abs(Math.cos((lobes * t) / 2)), 0.6);
    pts.push(`${round2(c + r * Math.cos(t))} ${round2(c + r * Math.sin(t))}`);
  }
  return `M${pts[0]}L${pts.slice(1).join('L')}Z`;
}

export const VERIFIED_SEAL_PATH = buildVerifiedSealPath();
/** Check mark (stroked, round caps) inside the seal. */
export const VERIFIED_CHECK_PATH = 'M7.6 12.4L10.6 15.3L16.5 9.1';
export const VERIFIED_CHECK_STROKE = 2.3;
export const VERIFIED_CHECK_COLOR = '#FFFFFF';

/* Verification info sheet («هذا الحساب موثّق»). */
export const VERIFIED_SHEET_TITLE = 'هذا الحساب موثّق';

const AR_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

/** «موثّق منذ أكتوبر 2026» from an ISO date; null when absent/invalid (the sheet hides the line). */
export function formatVerifiedSince(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `موثّق منذ ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
