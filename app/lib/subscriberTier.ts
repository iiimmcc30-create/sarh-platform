/**
 * Subscriber tier (Blue / Blue+ / Gold) read from the public identity fields every
 * payload already carries (`verified` + `verifiedTier`). The backend sets `verifiedTier`
 * only while a verification subscription is active, so legacy verified accounts (no tier)
 * keep the blue seal but get no subscriber styling. Pure — no RN imports.
 */
export type SubscriberTier = 'blue' | 'blue_plus' | 'gold';

type TierFields = { verified?: boolean | null; verifiedTier?: string | null } | null | undefined;

export function subscriberTierOf(user: TierFields): SubscriberTier | null {
  if (!user || user.verified !== true) return null;
  const t = user.verifiedTier;
  return t === 'gold' || t === 'blue_plus' || t === 'blue' ? t : null;
}

/** Gold and Blue+ get the premium council touches (entrance chip, list tag). */
export function isPremiumTier(tier: SubscriberTier | null | undefined): tier is 'gold' | 'blue_plus' {
  return tier === 'gold' || tier === 'blue_plus';
}

/** Theme token keys for a tier accent (gold for Gold, blue for Blue and Blue+). */
export function tierColorKeys(tier: SubscriberTier): { line: 'tierGold' | 'tierBlue'; soft: 'tierGoldSoft' | 'tierBlueSoft' } {
  return tier === 'gold' ? { line: 'tierGold', soft: 'tierGoldSoft' } : { line: 'tierBlue', soft: 'tierBlueSoft' };
}

export const GOLD_COUNCIL_TAG = 'مجلس ذهبي';
export const BLUE_PLUS_COUNCIL_TAG = 'Blue+';

/** Council list tag for the host's tier (Blue has none). */
export function councilTierTag(tier: SubscriberTier | null | undefined): string | null {
  if (tier === 'gold') return GOLD_COUNCIL_TAG;
  if (tier === 'blue_plus') return BLUE_PLUS_COUNCIL_TAG;
  return null;
}

/**
 * Live councils hosted by Gold first; everything else keeps the server order
 * (newest first). Stable, client-side only — the API has no tier sort.
 */
export function sortCouncilsByHostTier<T extends { owner: TierFields }>(list: readonly T[]): T[] {
  const gold: T[] = [];
  const rest: T[] = [];
  for (const c of list) (subscriberTierOf(c.owner) === 'gold' ? gold : rest).push(c);
  return gold.length ? [...gold, ...rest] : [...list];
}

/** «انضم فلان ✦» */
export function arrivalText(name: string): string {
  return `انضم ${name} ✦`;
}

export const ARRIVAL_MIN_GAP_MS = 4_000;
export const ARRIVAL_PER_USER_MS = 10 * 60_000;

/**
 * Client guard for entrance chips: one at a time (min gap) and never the same person
 * twice inside the per-user window, even if the server repeats the event.
 */
export function createArrivalGate(minGapMs = ARRIVAL_MIN_GAP_MS, perUserMs = ARRIVAL_PER_USER_MS) {
  let last = -Infinity;
  const seen = new Map<string, number>();
  return (userId: string, now: number): boolean => {
    if (now - last < minGapMs) return false;
    const prev = seen.get(userId);
    if (prev !== undefined && now - prev < perUserMs) return false;
    if (seen.size > 200) seen.clear();
    seen.set(userId, now);
    last = now;
    return true;
  };
}
