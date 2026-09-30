import { normalizePlanSlug } from '../../plans/plan.types';

/**
 * Verification badge tiers sold as monthly subscriptions.
 * - blue: verified individuals / sellers
 * - gold: verified merchants / professional sellers (business info required)
 *
 * Plans live in the existing `Plan` table (slugs below). Prices are NOT
 * hard-coded here: they come from the Plan rows managed in the admin plans
 * panel. The additive migration seeds both rows inactive with a 0 placeholder
 * price, so nothing can be purchased until an admin sets a real price.
 */
export type VerificationTier = 'blue' | 'gold';

export const VERIFICATION_TIERS: readonly VerificationTier[] = [
  'blue',
  'gold',
] as const;

export const VERIFICATION_PLAN_SLUGS: Record<VerificationTier, string> = {
  blue: 'blue-badge',
  gold: 'gold-badge',
};

/** Fallback benefit values when a plan row lacks the feature key. */
export const VERIFICATION_TIER_DEFAULTS: Record<
  VerificationTier,
  { extraDailyListings: number }
> = {
  blue: { extraDailyListings: 3 },
  gold: { extraDailyListings: 6 },
};

export function isVerificationTier(value: unknown): value is VerificationTier {
  return value === 'blue' || value === 'gold';
}

export function tierForPlanSlug(
  slug: string | null | undefined,
): VerificationTier | null {
  if (!slug) return null;
  const normalized = normalizePlanSlug(slug);
  if (normalized === VERIFICATION_PLAN_SLUGS.blue) return 'blue';
  if (normalized === VERIFICATION_PLAN_SLUGS.gold) return 'gold';
  return null;
}

export function isVerificationPlanSlug(slug: string | null | undefined) {
  return tierForPlanSlug(slug) !== null;
}

/**
 * Badge tier shown publicly. Requires BOTH an approved verification and an
 * active badge subscription. Gold needs a gold subscription AND a gold
 * (merchant) approval; otherwise a verified subscriber shows blue.
 */
export function resolveBadgeTier(params: {
  subscriptionTier: VerificationTier | null;
  approvedTier: VerificationTier | null;
}): VerificationTier | null {
  const { subscriptionTier, approvedTier } = params;
  if (!subscriptionTier || !approvedTier) return null;
  return subscriptionTier === 'gold' && approvedTier === 'gold'
    ? 'gold'
    : 'blue';
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

/**
 * Approved tier for a verification request. Requests approved before tiers
 * existed (status VERIFIED, approvedTier NULL) count as an approved blue
 * (individual) verification; gold always needs an explicit merchant approval.
 */
export function effectiveApprovedTier(
  request: { status?: string | null; approvedTier?: string | null } | null,
): VerificationTier | null {
  if (!request) return null;
  if (isVerificationTier(request.approvedTier)) return request.approvedTier;
  return request.status === 'VERIFIED' ? 'blue' : null;
}
