import { ensureApiReachable } from './api';
import { shouldReuseFreshResult } from './requestCoordination';

export type PaidServiceFlags = {
  /** ترويج الظهور */
  promotionEnabled: boolean;
  /** تثبيت الإعلان */
  pinEnabled: boolean;
  /** تمييز الإعلان */
  featureEnabled: boolean;
  /** سداد الرسوم / التعهد / عمولة / زر ترقية الإعلان */
  listingFeesEnabled: boolean;
};

export const DEFAULT_PAID_SERVICE_FLAGS: PaidServiceFlags = {
  promotionEnabled: true,
  pinEnabled: true,
  featureEnabled: true,
  listingFeesEnabled: true,
};

export const PAID_SERVICES_TTL_MS = 60_000;

let cachedFlags: PaidServiceFlags | null = null;
let cachedAt: number | undefined;
let inflight: Promise<PaidServiceFlags> | null = null;

/** True when a network response has been stored (defaults do not count). */
export function hasCachedPaidServiceFlags(): boolean {
  return cachedFlags != null;
}

/** Test-only reset of flags, TTL timestamp, and in-flight fetch. */
export function resetPaidServicesCache(): void {
  cachedFlags = null;
  cachedAt = undefined;
  inflight = null;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeFlags(raw: unknown): PaidServiceFlags {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PAID_SERVICE_FLAGS };
  const obj = raw as Record<string, unknown>;
  return {
    promotionEnabled: asBool(obj.promotionEnabled, DEFAULT_PAID_SERVICE_FLAGS.promotionEnabled),
    pinEnabled: asBool(obj.pinEnabled, DEFAULT_PAID_SERVICE_FLAGS.pinEnabled),
    featureEnabled: asBool(obj.featureEnabled, DEFAULT_PAID_SERVICE_FLAGS.featureEnabled),
    listingFeesEnabled: asBool(
      obj.listingFeesEnabled,
      DEFAULT_PAID_SERVICE_FLAGS.listingFeesEnabled,
    ),
  };
}

/** Any of pin / feature / promotion is available for purchase UI. */
export function hasAnyBoostService(flags: PaidServiceFlags): boolean {
  return flags.promotionEnabled || flags.pinEnabled || flags.featureEnabled;
}

export function isPromoteGoalEnabled(
  goal: 'visibility' | 'pinned' | 'featured',
  flags: PaidServiceFlags,
): boolean {
  if (goal === 'visibility') return flags.promotionEnabled;
  if (goal === 'pinned') return flags.pinEnabled;
  return flags.featureEnabled;
}

export function isBoostTypeEnabled(
  type: 'pinned' | 'featured' | 'promotion',
  flags: PaidServiceFlags,
): boolean {
  if (type === 'promotion') return flags.promotionEnabled;
  if (type === 'pinned') return flags.pinEnabled;
  return flags.featureEnabled;
}

export function firstEnabledPromoteGoal(
  flags: PaidServiceFlags,
): 'visibility' | 'pinned' | 'featured' | null {
  if (flags.promotionEnabled) return 'visibility';
  if (flags.pinEnabled) return 'pinned';
  if (flags.featureEnabled) return 'featured';
  return null;
}

export function firstEnabledBoostType(
  flags: PaidServiceFlags,
): 'pinned' | 'featured' | 'promotion' | null {
  if (flags.pinEnabled) return 'pinned';
  if (flags.featureEnabled) return 'featured';
  if (flags.promotionEnabled) return 'promotion';
  return null;
}

export function getCachedPaidServiceFlags(): PaidServiceFlags {
  return cachedFlags ?? { ...DEFAULT_PAID_SERVICE_FLAGS };
}

export function fetchPaidServiceFlags(options?: {
  force?: boolean;
}): Promise<PaidServiceFlags> {
  const force = options?.force === true;
  if (cachedFlags && shouldReuseFreshResult(cachedAt, PAID_SERVICES_TTL_MS, force)) {
    return Promise.resolve(cachedFlags);
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const base = await ensureApiReachable();
      const res = await fetch(`${base.replace(/\/$/, '')}/api/settings/paid-services`, {
        cache: 'no-store',
      });
      if (!res.ok) return getCachedPaidServiceFlags();
      const json = await res.json();
      const flags = normalizeFlags(json?.data?.flags);
      cachedFlags = flags;
      cachedAt = Date.now();
      return flags;
    } catch {
      return getCachedPaidServiceFlags();
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
