import {
  SAUDI_CITIES,
  SAUDI_CITY_REGIONS,
  type SaudiCityEntry,
} from '@/constants/saudiCities.generated';

export type { SaudiCityEntry };

/** «القريب منك» radius chips (km). Same values the API accepts. */
export const NEARBY_RADII_KM = [25, 50, 100, 200] as const;
export type NearbyRadiusKm = (typeof NEARBY_RADII_KM)[number];
export const DEFAULT_NEARBY_RADIUS_KM: NearbyRadiusKm = 50;

const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u200c-\u200f]/g;

/** Same rules as the backend matcher (backend-nest/src/geo/lib/arabic-place-normalize.ts). */
export function normalizeCityName(input: string | null | undefined): string {
  let s = String(input ?? '').trim();
  if (!s) return '';
  s = s
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase();
  s = s.replace(/^\s*(محافظه|مدينه|منطقه|مركز|بلده|قريه)\s+/, '');
  s = s.replace(/اء(?=\s|$)/g, 'ا');
  s = s.replace(/[\s\-_.,،()/\\'"`]+/g, '');
  if (s.startsWith('ال') && s.length > 3) s = s.slice(2);
  s = s.replace(/^(al|ar|as|ash|ad|adh|at|az|an|ath|el)(?=[a-z]{3,})/, '');
  return s;
}

const byId = new Map(SAUDI_CITIES.map((c) => [c.id, c]));
const regionName = new Map(SAUDI_CITY_REGIONS.map((r) => [r.id, r.nameAr]));
const keyIndex: Array<{ city: SaudiCityEntry; keys: string[] }> = SAUDI_CITIES.map((city) => ({
  city,
  keys: Array.from(
    new Set([city.nameAr, city.nameEn, ...city.aliases].map(normalizeCityName).filter(Boolean)),
  ),
}));

export function saudiCityById(id: string | null | undefined): SaudiCityEntry | null {
  return id ? (byId.get(id) ?? null) : null;
}

export function saudiRegionNameAr(regionId: string): string {
  return regionName.get(regionId) ?? '';
}

/** Exact (normalized) name/alias match, e.g. "حفرالباطن" → حفر الباطن. */
export function matchSaudiCityName(name: string | null | undefined): SaudiCityEntry | null {
  const k = normalizeCityName(name);
  if (!k) return null;
  for (const row of keyIndex) if (row.keys.includes(k)) return row.city;
  return null;
}

/**
 * Picker search: exact name first, then names starting with the query, then
 * names containing it. Empty query → every city in list order.
 */
export function searchSaudiCities(query: string, limit = 400): SaudiCityEntry[] {
  const q = normalizeCityName(query);
  if (!q) return SAUDI_CITIES.slice(0, limit);
  const exact: SaudiCityEntry[] = [];
  const prefix: SaudiCityEntry[] = [];
  const contains: SaudiCityEntry[] = [];
  for (const { city, keys } of keyIndex) {
    if (keys.some((k) => k === q)) exact.push(city);
    else if (keys.some((k) => k.startsWith(q))) prefix.push(city);
    else if (keys.some((k) => k.includes(q))) contains.push(city);
  }
  return [...exact, ...prefix, ...contains].slice(0, limit);
}

const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Nearest city centre to a device point (no reverse geocoding). */
export function nearestSaudiCity(
  lat: number,
  lng: number,
): { city: SaudiCityEntry; km: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best: { city: SaudiCityEntry; km: number } | null = null;
  for (const city of SAUDI_CITIES) {
    const km = haversineKm(lat, lng, city.lat, city.lng);
    if (!best || km < best.km) best = { city, km };
  }
  return best;
}

/** ~1 km grid: what the app sends for a GPS-placed listing / nearby query. */
export function roundCoord2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Card label for a server distance (already rounded server-side): «~35 كم». */
export function formatDistanceKm(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  return `~${Math.max(1, Math.round(km))} كم`;
}
