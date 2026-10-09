/**
 * Subscriber visibility preferences («التوثيق» hub):
 * - hideVerifiedBadge: other users see the account without a badge
 *   (`verified: false`, `verifiedTier: null`);
 * - hideGoldSellerLabel: other users see the gold badge without «بائع ذهبي»
 *   (`hideGoldSellerLabel: true`, which the apps honour).
 *
 * Applied to outgoing API payloads only. The database keeps the real values,
 * so ranking (visibility level, Gold-first in a region), limits and every
 * other perk are unchanged, and the owner always sees their own badge.
 */
export type BadgeVisibilityPrefs = {
  hideVerifiedBadge: boolean;
  hideGoldSellerLabel: boolean;
};

export type HiddenBadgeMap = ReadonlyMap<string, BadgeVisibilityPrefs>;

const MAX_DEPTH = 14;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

/** A user-shaped object: string id plus a badge field. */
function isUserLike(o: Record<string, unknown>): boolean {
  return (
    typeof o.id === 'string' &&
    (Object.prototype.hasOwnProperty.call(o, 'verified') ||
      Object.prototype.hasOwnProperty.call(o, 'verifiedTier'))
  );
}

/**
 * Returns the payload with hidden badges / labels masked for everyone but
 * `viewerId`. Copy-on-write: untouched branches keep their identity, and the
 * input (which may be a shared cached object) is never mutated.
 */
export function maskHiddenBadges<T>(
  payload: T,
  hidden: HiddenBadgeMap,
  viewerId: string | null | undefined,
): T {
  if (hidden.size === 0) return payload;
  const walk = (value: unknown, depth: number): unknown => {
    if (depth > MAX_DEPTH || value === null || typeof value !== 'object') {
      return value;
    }
    if (Array.isArray(value)) {
      let out: unknown[] | null = null;
      for (let i = 0; i < value.length; i++) {
        const next = walk(value[i], depth + 1);
        if (next !== value[i]) {
          out ??= value.slice();
          out[i] = next;
        }
      }
      return out ?? value;
    }
    if (!isPlainObject(value)) return value;
    let out: Record<string, unknown> | null = null;
    for (const key of Object.keys(value)) {
      const next = walk(value[key], depth + 1);
      if (next !== value[key]) {
        out ??= { ...value };
        out[key] = next;
      }
    }
    const source = out ?? value;
    if (isUserLike(source) && source.id !== viewerId) {
      const prefs = hidden.get(source.id as string);
      if (prefs?.hideVerifiedBadge) {
        out ??= { ...value };
        if ('verified' in out) out.verified = false;
        if ('verifiedTier' in out) out.verifiedTier = null;
        if ('subscriptionBadge' in out) out.subscriptionBadge = false;
      } else if (prefs?.hideGoldSellerLabel) {
        out ??= { ...value };
        out.hideGoldSellerLabel = true;
      }
    }
    return out ?? value;
  };
  return walk(payload, 0) as T;
}
