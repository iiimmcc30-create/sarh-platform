import { normalizePlanSlug } from '../../plans/plan.types';

/**
 * Verification plans sold as monthly subscriptions (order: Blue, Blue+, Gold).
 * - blue:      blue badge, +3 daily listings, visibility level 1. No document.
 * - blue_plus: BLUE badge (never gold), +6 daily listings, visibility level 2.
 *              No document.
 * - gold:      gold badge, +10 daily listings, visibility level 3 (highest).
 *              A merchant document is REQUIRED before payment (enforced
 *              server-side in PaymentsService via GoldDocumentGateService) and
 *              the gold badge needs the admin-approved Gold verification.
 *
 * Plans live in the existing `Plan` table (slugs below). Prices are NOT
 * hard-coded here: they come from the Plan rows managed in the admin plans
 * panel (single source of truth). Migrations 20260930130000 + 20260930150000
 * set 29 / 59 / 99 SAR per month. Renewal is manual: reminders plus a new
 * payment through the existing checkout (no saved card, no auto-charge).
 *
 * `User.verifiedTier` stores the tier of the active badge (blue | blue_plus |
 * gold). Apps colour the badge gold ONLY for "gold"; every other value
 * (including blue_plus and legacy NULL) renders the blue badge.
 */
export type VerificationTier = 'blue' | 'blue_plus' | 'gold';

/** Tier requested / approved in the verification (document) review. */
export type ReviewTier = 'blue' | 'gold';

/** Badge colour shown publicly. */
export type BadgeColor = 'blue' | 'gold';

export const VERIFICATION_TIERS: readonly VerificationTier[] = [
  'blue',
  'blue_plus',
  'gold',
] as const;

export const VERIFICATION_PLAN_SLUGS: Record<VerificationTier, string> = {
  blue: 'blue-badge',
  blue_plus: 'blue-plus-badge',
  gold: 'gold-badge',
};

/**
 * Fallback benefit values when a plan row lacks the feature key.
 * visibilityLevel is the seller priority used to rank listings
 * (PlanPermissionService.priorityBoost): Blue 1 < Blue+ 2 < Gold 3.
 */
export const VERIFICATION_TIER_DEFAULTS: Record<
  VerificationTier,
  { extraDailyListings: number; visibilityLevel: number }
> = {
  blue: { extraDailyListings: 3, visibilityLevel: 1 },
  blue_plus: { extraDailyListings: 6, visibilityLevel: 2 },
  gold: { extraDailyListings: 10, visibilityLevel: 3 },
};

export const BADGE_COLOR_FOR_TIER: Record<VerificationTier, BadgeColor> = {
  blue: 'blue',
  blue_plus: 'blue',
  gold: 'gold',
};

/** Only an explicit "gold" is gold; anything else (blue_plus, legacy) is blue. */
export function badgeColorForTier(tier: unknown): BadgeColor {
  return tier === 'gold' ? 'gold' : 'blue';
}

export function isVerificationTier(value: unknown): value is VerificationTier {
  return value === 'blue' || value === 'blue_plus' || value === 'gold';
}

export function isReviewTier(value: unknown): value is ReviewTier {
  return value === 'blue' || value === 'gold';
}

export function tierForPlanSlug(
  slug: string | null | undefined,
): VerificationTier | null {
  if (!slug) return null;
  const normalized = normalizePlanSlug(slug);
  for (const tier of VERIFICATION_TIERS) {
    if (normalized === VERIFICATION_PLAN_SLUGS[tier]) return tier;
  }
  return null;
}

export function isVerificationPlanSlug(slug: string | null | undefined) {
  return tierForPlanSlug(slug) !== null;
}

/**
 * Tiers that need a document before payment (and an approved verification for
 * the badge colour). Blue and Blue+ do NOT; Gold does.
 */
export const TIER_REQUIRES_DOCUMENT: Record<VerificationTier, boolean> = {
  blue: false,
  blue_plus: false,
  gold: true,
};

/** @deprecated alias kept for existing callers: same as TIER_REQUIRES_DOCUMENT. */
export const TIER_REQUIRES_VERIFICATION = TIER_REQUIRES_DOCUMENT;

/**
 * Badge tier stored on the user (requires an ACTIVE verification subscription):
 * - Blue subscription → blue.
 * - Blue+ subscription → blue_plus (blue badge colour, never gold).
 * - Gold subscription + approved Gold (merchant) verification → gold.
 * - Gold subscription without a Gold approval (document still under review,
 *   or rejected) → blue (never gold).
 */
export function resolveBadgeTier(params: {
  subscriptionTier: VerificationTier | null;
  approvedTier: ReviewTier | null;
}): VerificationTier | null {
  const { subscriptionTier, approvedTier } = params;
  if (!subscriptionTier) return null;
  if (subscriptionTier === 'gold') {
    return approvedTier === 'gold' ? 'gold' : 'blue';
  }
  return subscriptionTier;
}

/** Extra daily listings granted by a plan (feature value, tier default fallback). */
export function extraDailyListingsForPlan(
  slug: string,
  featureValue: unknown,
): number {
  if (typeof featureValue === 'number' && Number.isFinite(featureValue)) {
    return Math.max(0, Math.floor(featureValue));
  }
  if (typeof featureValue === 'string' && featureValue.trim() !== '') {
    const n = Number(featureValue);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  const tier = tierForPlanSlug(slug);
  return tier ? VERIFICATION_TIER_DEFAULTS[tier].extraDailyListings : 0;
}

/** Visibility level of a verification plan (null for other plans). */
export function visibilityLevelForPlan(
  slug: string | null | undefined,
): number | null {
  const tier = tierForPlanSlug(slug);
  return tier ? VERIFICATION_TIER_DEFAULTS[tier].visibilityLevel : null;
}

/**
 * Approved tier for a verification request. Requests approved before tiers
 * existed (status VERIFIED, approvedTier NULL) count as an approved blue
 * (individual) verification; gold always needs an explicit merchant approval.
 */
export function effectiveApprovedTier(
  request: { status?: string | null; approvedTier?: string | null } | null,
): ReviewTier | null {
  if (!request) return null;
  if (isReviewTier(request.approvedTier)) return request.approvedTier;
  return request.status === 'VERIFIED' ? 'blue' : null;
}
