import { API_BASE } from '@/services/api';
import {
  FALLBACK_EXPLORE_SARH_BANNERS,
  mapRemoteExploreSarhBanner,
  type ExploreSarhBannerView,
} from '@/lib/exploreSarhBanners';
import { dedupeInflight } from '@/services/requestCoordination';

const EXPLORE_SARH_BANNERS_TTL_MS = 60_000;

let cache: { at: number; data: ExploreSarhBannerView[] } | null = null;

/** Test-only reset. */
export function resetExploreSarhBannersCache() {
  cache = null;
}

export async function fetchExploreSarhBanners(
  options?: { force?: boolean },
): Promise<ExploreSarhBannerView[]> {
  const force = options?.force === true;
  const now = Date.now();
  if (!force && cache && now - cache.at < EXPLORE_SARH_BANNERS_TTL_MS) {
    return cache.data;
  }

  return dedupeInflight('GET:/api/explore-sarh-banners', async () => {
    try {
      const res = await fetch(`${API_BASE}/api/explore-sarh-banners`);
      if (!res.ok) {
        return cache?.data ?? FALLBACK_EXPLORE_SARH_BANNERS;
      }
      const json = (await res.json()) as {
        success?: boolean;
        data?: { banners?: unknown[] };
      };
      const rows = Array.isArray(json?.data?.banners) ? json.data.banners : [];
      const mapped = rows
        .map((row) => mapRemoteExploreSarhBanner((row ?? {}) as Record<string, unknown>))
        .filter((row): row is ExploreSarhBannerView => Boolean(row));
      if (mapped.length === 0) {
        const data = cache?.data ?? FALLBACK_EXPLORE_SARH_BANNERS;
        cache = { at: Date.now(), data };
        return data;
      }
      cache = { at: Date.now(), data: mapped };
      return mapped;
    } catch {
      return cache?.data ?? FALLBACK_EXPLORE_SARH_BANNERS;
    }
  });
}
