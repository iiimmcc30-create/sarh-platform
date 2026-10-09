import {
  tierForPlanSlug,
  type VerificationTier,
} from '../verification/verification-tiers';
import type { SubscriptionEntitlementService } from '../services/subscription-entitlement.service';

/**
 * Subscriber perks (server-side source of truth; the apps only mirror them):
 * - «مين شاف ملفي»: every paid tier (Blue, Blue+, Gold).
 * - Weekly free boosts: Blue+ 2, Gold 4, Blue 0 (plan feature `weeklyFreeBoosts`).
 * - «بائع ذهبي» + Gold-first in the searched region: the public Gold badge
 *   (`User.verifiedTier === 'gold'`, set only while Gold is active + approved).
 * - Councils: followers-only for Gold hosts, scheduling for Blue+ and Gold.
 *
 * The tier comes from the ACTIVE subscription (effective plan slug), never
 * from the client.
 */
export async function activeSubscriberTier(
  entitlements: Pick<
    SubscriptionEntitlementService,
    'getEffectivePlanSlugForUser'
  >,
  userId: string,
): Promise<VerificationTier | null> {
  const slug = await entitlements.getEffectivePlanSlugForUser(userId);
  return tierForPlanSlug(slug);
}

export function canSeeProfileViewers(tier: VerificationTier | null): boolean {
  return tier !== null;
}

export function canScheduleCouncils(tier: VerificationTier | null): boolean {
  return tier === 'blue_plus' || tier === 'gold';
}

export function canHostFollowersOnlyCouncils(
  tier: VerificationTier | null,
): boolean {
  return tier === 'gold';
}

/** Free weekly boosts are ListingBoost rows (amount 0) with this transaction prefix. */
export const FREE_WEEKLY_BOOST_TX_PREFIX = 'FREE-WEEKLY-';
/** Rolling window of the weekly free-boost allowance (7 days). */
export const FREE_WEEKLY_BOOST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** «دعم بأولوية»: Gold tickets open as HIGH (support/services/ticket-priority.ts). */
export function hasPrioritySupport(tier: VerificationTier | null): boolean {
  return tier === 'gold';
}

/** Fallback when the plan row has no `weeklyFreeBoosts` feature. */
export const WEEKLY_FREE_BOOSTS_DEFAULT: Record<VerificationTier, number> = {
  blue: 0,
  blue_plus: 2,
  gold: 4,
};

/** Weekly free boosts for a plan (feature value first, tier default fallback). */
export function weeklyFreeBoostsFor(
  tier: VerificationTier | null,
  featureValue: unknown,
): number {
  if (!tier) return 0;
  const n =
    typeof featureValue === 'number'
      ? featureValue
      : typeof featureValue === 'string' && featureValue.trim() !== ''
        ? Number(featureValue)
        : Number.NaN;
  if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  return WEEKLY_FREE_BOOSTS_DEFAULT[tier];
}

/** «بائع ذهبي»: public Gold badge only (same rule as the gold seal). */
export function isGoldSeller(
  user:
    | { verified?: boolean | null; verifiedTier?: string | null }
    | null
    | undefined,
): boolean {
  return Boolean(
    user && user.verified === true && user.verifiedTier === 'gold',
  );
}

/**
 * Gold sellers first (stable). Used only when the searcher picked a region, so
 * Gold listings lead inside that region; relative order is otherwise kept.
 */
export function goldSellersFirst<T>(
  items: readonly T[],
  sellerOf: (
    item: T,
  ) =>
    | { verified?: boolean | null; verifiedTier?: string | null }
    | null
    | undefined,
): T[] {
  const gold: T[] = [];
  const rest: T[] = [];
  for (const item of items)
    (isGoldSeller(sellerOf(item)) ? gold : rest).push(item);
  return gold.length ? [...gold, ...rest] : [...items];
}
