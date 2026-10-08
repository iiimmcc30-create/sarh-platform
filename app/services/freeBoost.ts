// «تمييز مجاني» — weekly free boosts included in Blue+ (2) and Gold (4).
// The server owns eligibility, the rolling 7-day quota and the boost itself;
// the app only mirrors the quota and asks the server to apply one.
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';

export type FreeBoostQuota = {
  eligible: boolean;
  tier: string | null;
  weeklyLimit: number;
  used: number;
  remaining: number;
  nextResetAt: string | null;
  boostType: string;
  durationHours: number;
};

export class FreeBoostError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = 'FreeBoostError';
  }
}

const NO_STORE: RequestInit = { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } };

export async function fetchFreeBoostQuota(): Promise<FreeBoostQuota | null> {
  try {
    const res = await authFetch(`${API_BASE}/api/listings/boost/free-quota`, NO_STORE);
    if (!res.ok) return null;
    const json = (await res.json()) as { success?: boolean; data?: unknown };
    return normalizeFreeBoostQuota(json?.data);
  } catch {
    return null;
  }
}

export type FreeBoostApplied = {
  boostId: string;
  listingId: string;
  boostType: string;
  expiresAt: string;
  remaining: number;
};

export async function applyFreeBoost(listingId: string): Promise<FreeBoostApplied> {
  const res = await authFetch(
    `${API_BASE}/api/listings/${encodeURIComponent(listingId)}/boost/free`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    20_000,
  );
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  if (!res.ok || !json?.success) {
    const message =
      (typeof json?.messageAr === 'string' && json.messageAr) || 'تعذّر تطبيق التمييز المجاني، حاول مرة أخرى';
    const code = typeof json?.error === 'string' ? json.error : `http_${res.status}`;
    throw new FreeBoostError(message, res.status, code);
  }
  return json.data as FreeBoostApplied;
}

export function normalizeFreeBoostQuota(raw: unknown): FreeBoostQuota | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  const weeklyLimit = num(r.weeklyLimit);
  const used = num(r.used);
  return {
    eligible: r.eligible === true && weeklyLimit > 0,
    tier: typeof r.tier === 'string' ? r.tier : null,
    weeklyLimit,
    used,
    remaining: Math.min(weeklyLimit, typeof r.remaining === 'number' ? num(r.remaining) : Math.max(0, weeklyLimit - used)),
    nextResetAt: typeof r.nextResetAt === 'string' ? r.nextResetAt : null,
    boostType: typeof r.boostType === 'string' ? r.boostType : 'featured',
    durationHours: num(r.durationHours) || 24,
  };
}

/** Option title: «تمييز مجاني (متبقي X)». */
export function freeBoostTitle(remaining: number): string {
  return `تمييز مجاني (متبقي ${Math.max(0, Math.floor(remaining || 0))})`;
}

/** Subtitle under the title — duration while available, reset day once used up. */
export function freeBoostSubtitle(quota: Pick<FreeBoostQuota, 'remaining' | 'durationHours' | 'nextResetAt'>, now = new Date()): string {
  if (quota.remaining > 0) {
    return `تمييز لمدة ${quota.durationHours} ساعة ضمن اشتراكك — بدون دفع`;
  }
  if (!quota.nextResetAt) return 'استخدمت تمييزك المجاني لهذا الأسبوع';
  const reset = new Date(quota.nextResetAt);
  if (Number.isNaN(reset.getTime())) return 'استخدمت تمييزك المجاني لهذا الأسبوع';
  const days = Math.max(1, Math.ceil((reset.getTime() - now.getTime()) / 86_400_000));
  if (days <= 1) return 'استخدمت تمييزك المجاني — يتجدد خلال يوم';
  if (days === 2) return 'استخدمت تمييزك المجاني — يتجدد خلال يومين';
  return `استخدمت تمييزك المجاني — يتجدد خلال ${days} أيام`;
}
