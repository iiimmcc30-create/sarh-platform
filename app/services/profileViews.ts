// «من شاهد ملفك» — API client. The server decides what the viewer may see:
// non-subscribers get only the 30-day count (`locked`), never identities.
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';

export type ProfileViewer = {
  id: string;
  username: string;
  displayName: string;
  arabicName: string;
  avatar?: string | null;
  verified: boolean;
  verifiedTier?: string | null;
};

export type ProfileViewsResult = {
  locked: boolean;
  windowDays: number;
  total: number;
  viewers: { user: ProfileViewer; viewedAt: string }[];
};

export const PROFILE_VIEWS_TITLE = 'من شاهد ملفك';
export const PROFILE_VIEWS_LOCKED_ROWS = 5;

export async function fetchProfileViews(): Promise<ProfileViewsResult | null> {
  try {
    const res = await authFetch(`${API_BASE}/api/users/me/profile-views`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { success?: boolean; data?: unknown };
    return normalizeProfileViews(json?.data);
  } catch {
    return null;
  }
}

/** Defensive parse: anything malformed collapses to a locked, empty result. */
export function normalizeProfileViews(raw: unknown): ProfileViewsResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const total = typeof r.total === 'number' && Number.isFinite(r.total) ? Math.max(0, Math.floor(r.total)) : 0;
  const windowDays = typeof r.windowDays === 'number' ? r.windowDays : 30;
  const locked = r.locked !== false;
  const viewers = !locked && Array.isArray(r.viewers)
    ? (r.viewers as { user?: ProfileViewer; viewedAt?: string }[])
        .filter((v) => v && v.user && typeof v.user.id === 'string' && typeof v.viewedAt === 'string')
        .map((v) => ({ user: v.user as ProfileViewer, viewedAt: v.viewedAt as string }))
    : [];
  return { locked, windowDays, total, viewers };
}

/** "١٢ شخصاً شاهدوا ملفك خلال آخر ٣٠ يوماً" style summary (Arabic plural rules simplified). */
export function profileViewsSummary(total: number, windowDays = 30): string {
  const n = Math.max(0, Math.floor(total || 0));
  const span = `خلال آخر ${windowDays} يوماً`;
  if (n === 0) return `لم يشاهد أحد ملفك ${span}`;
  if (n === 1) return `شخص واحد شاهد ملفك ${span}`;
  if (n === 2) return `شخصان شاهدا ملفك ${span}`;
  if (n <= 10) return `${n} أشخاص شاهدوا ملفك ${span}`;
  return `${n.toLocaleString('en-US')} شخصاً شاهدوا ملفك ${span}`;
}
