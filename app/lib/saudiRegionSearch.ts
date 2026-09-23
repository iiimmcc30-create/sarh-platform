import type { RegionSelection, SaudiCity, SaudiRegion } from '@/constants/saudiRegions';
import { SAUDI_REGIONS } from '@/constants/saudiRegions';

export function normalizeArabic(text: string): string {
  return text
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Compact form for matching "حفرالباطن" ↔ "حفر الباطن". */
function compactArabic(text: string): string {
  return normalizeArabic(text).replace(/\s+/g, '');
}

export type RegionSearchHit =
  | { kind: 'region'; region: SaudiRegion; score: number }
  | { kind: 'city'; region: SaudiRegion; city: SaudiCity; score: number };

/** Short labels used when listing location is just "القصيم" / "الشرقية". */
export function regionMatchTokens(region: SaudiRegion): string[] {
  const full = normalizeArabic(region.nameAr);
  const stripped = full
    .replace(/^منطقه\s+/, '')
    .replace(/^المنطقه\s+/, '');
  const tokens = new Set<string>([full, stripped, normalizeArabic(region.nameEn)]);
  if (region.id === 'eastern') {
    tokens.add('الشرقيه');
    tokens.add('الشرقية');
  }
  return [...tokens].filter(Boolean);
}

function textMatchesToken(haystack: string, haystackCompact: string, token: string): boolean {
  if (!token) return false;
  if (haystack.includes(token) || token.includes(haystack)) return true;
  const compact = compactArabic(token);
  return (
    !!compact &&
    (haystackCompact.includes(compact) || compact.includes(haystackCompact))
  );
}

/** Fuzzy search across Saudi regions and cities (Arabic + English). */
export function searchSaudiRegions(query: string): RegionSearchHit[] {
  const q = normalizeArabic(query);
  const qEn = query.trim().toLowerCase();
  if (!q && !qEn) {
    return SAUDI_REGIONS.flatMap((region) =>
      region.cities.map((city) => ({
        kind: 'city' as const,
        region,
        city,
        score: 0,
      })),
    );
  }

  const hits: RegionSearchHit[] = [];

  for (const region of SAUDI_REGIONS) {
    const regionTokens = regionMatchTokens(region);
    if (
      regionTokens.some((t) => t.includes(q) || q.includes(t)) ||
      region.nameEn.toLowerCase().includes(qEn)
    ) {
      hits.push({
        kind: 'region',
        region,
        score: regionTokens.some((t) => t.startsWith(q)) ? 0 : 1,
      });
    }

    for (const city of region.cities) {
      const cityAr = normalizeArabic(city.nameAr);
      const cityEn = city.nameEn.toLowerCase();
      const cityCompact = compactArabic(city.nameAr);
      const qCompact = compactArabic(query);
      if (
        cityAr.includes(q) ||
        q.includes(cityAr) ||
        cityEn.includes(qEn) ||
        (qCompact && cityCompact.includes(qCompact))
      ) {
        hits.push({
          kind: 'city',
          region,
          city,
          score: cityAr.startsWith(q) ? 0 : 1,
        });
      }
    }
  }

  return hits.sort((a, b) => a.score - b.score);
}

/** Match listing location text against a region/city selection. */
export function listingMatchesRegionSelection(
  locationText: string,
  selection: RegionSelection,
): boolean {
  if (selection.type === 'all') return true;

  const raw = typeof locationText === 'string' ? locationText.trim() : '';
  if (!raw) return false;

  const haystack = normalizeArabic(raw);
  const haystackCompact = compactArabic(raw);

  if (selection.type === 'city') {
    const cityAr = normalizeArabic(selection.city.nameAr);
    const cityEn = selection.city.nameEn.toLowerCase();
    return (
      textMatchesToken(haystack, haystackCompact, cityAr) ||
      raw.toLowerCase().includes(cityEn)
    );
  }

  for (const token of regionMatchTokens(selection.region)) {
    if (textMatchesToken(haystack, haystackCompact, token)) return true;
  }

  return selection.region.cities.some((city) => {
    const cityAr = normalizeArabic(city.nameAr);
    return textMatchesToken(haystack, haystackCompact, cityAr);
  });
}

export function regionSelectionLabel(selection: RegionSelection): string {
  if (selection.type === 'all') return 'كل المناطق';
  if (selection.type === 'city') return selection.city.nameAr;
  return selection.region.nameAr.replace(/^منطقة\s/, '').replace(/^المنطقة\s/, '');
}

/** Map a device geocode place onto the existing Saudi region/city catalog. */
export function resolveNearbyRegionSelection(place: {
  city?: string | null;
  subregion?: string | null;
  region?: string | null;
}): RegionSelection | null {
  const queries: string[] = [];
  for (const raw of [place.city, place.subregion, place.region]) {
    const value = raw?.trim();
    if (!value) continue;
    queries.push(value);
    for (const part of value.split(/[\s,،-]+/)) {
      if (part.trim().length >= 3) queries.push(part.trim());
    }
  }

  const seen = new Set<string>();
  for (const query of queries) {
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const hits = searchSaudiRegions(query);
    const cityHit = hits.find((hit): hit is Extract<RegionSearchHit, { kind: 'city' }> => hit.kind === 'city');
    if (cityHit) {
      return { type: 'city', region: cityHit.region, city: cityHit.city };
    }
    const regionHit = hits.find(
      (hit): hit is Extract<RegionSearchHit, { kind: 'region' }> => hit.kind === 'region',
    );
    if (regionHit) {
      return { type: 'region', region: regionHit.region };
    }
  }

  return null;
}
