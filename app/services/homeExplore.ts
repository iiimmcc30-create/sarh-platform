import { API_BASE } from '@/services/api';
import {
  FALLBACK_HOME_EXPLORE,
  resolveExploreCard,
  type HomeExploreCard,
} from '@/lib/homeExplore';
import { dedupeInflight } from '@/services/requestCoordination';

const EXPLORE_TTL_MS = 60_000;

let exploreCache: { at: number; data: HomeExploreCard[] } | null = null;

/** Test-only reset. */
export function resetHomeExploreCache() {
  exploreCache = null;
}

export async function fetchHomeExploreSections(
  options?: { force?: boolean },
): Promise<HomeExploreCard[]> {
  const force = options?.force === true;
  const now = Date.now();
  if (!force && exploreCache && now - exploreCache.at < EXPLORE_TTL_MS) {
    return exploreCache.data;
  }

  return dedupeInflight('GET:/api/home/explore', async () => {
    try {
      const res = await fetch(`${API_BASE}/api/home/explore`);
      if (!res.ok) {
        return exploreCache?.data ?? FALLBACK_HOME_EXPLORE;
      }
      const json = (await res.json()) as { data?: { sections?: unknown[] } };
      const rows = Array.isArray(json?.data?.sections) ? json.data.sections : [];
      const mapped = rows
        .map((row) => resolveExploreCard((row ?? {}) as Partial<HomeExploreCard>))
        .filter((row): row is HomeExploreCard => Boolean(row));
      const data = mapped.length > 0 ? mapped : FALLBACK_HOME_EXPLORE;
      exploreCache = { at: Date.now(), data };
      return data;
    } catch {
      return exploreCache?.data ?? FALLBACK_HOME_EXPLORE;
    }
  });
}
