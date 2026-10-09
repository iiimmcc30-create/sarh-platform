import { SAUDI_CITIES, SAUDI_CITY_REGIONS } from '@/constants/saudiCities.generated';

export type SaudiCity = {
  id: string;
  nameAr: string;
  nameEn: string;
};

export type SaudiRegion = {
  id: string;
  nameAr: string;
  nameEn: string;
  cities: SaudiCity[];
};

/**
 * المملكة — 13 منطقة وكل مدنها ومحافظاتها، من قائمة المدن الموحّدة
 * (constants/saudiCities.generated.ts ← backend-nest/assets/geo/saudi-cities.json).
 */
export const SAUDI_REGIONS: SaudiRegion[] = SAUDI_CITY_REGIONS.map((region) => ({
  id: region.id,
  nameAr: region.nameAr,
  nameEn: region.nameEn,
  cities: SAUDI_CITIES.filter((c) => c.regionId === region.id).map((c) => ({
    id: c.id,
    nameAr: c.nameAr,
    nameEn: c.nameEn,
  })),
}));

export type RegionSelection =
  | { type: 'all' }
  | { type: 'region'; region: SaudiRegion }
  | { type: 'city'; region: SaudiRegion; city: SaudiCity };

export const ALL_REGIONS_LABEL = 'كل المناطق';

/** Featured city chips shown in the region picker sheet. */
export const SAUDI_MAIN_CITIES: Array<{
  regionId: string;
  cityId: string;
}> = [
  { regionId: 'eastern', cityId: 'dammam' },
  { regionId: 'riyadh', cityId: 'riyadh-city' },
  { regionId: 'makkah', cityId: 'jeddah' },
  { regionId: 'madinah', cityId: 'madinah-city' },
  { regionId: 'makkah', cityId: 'makkah-city' },
];

export function resolveSaudiMainCities(): Array<{
  region: SaudiRegion;
  city: SaudiCity;
}> {
  const out: Array<{ region: SaudiRegion; city: SaudiCity }> = [];
  for (const ref of SAUDI_MAIN_CITIES) {
    const region = SAUDI_REGIONS.find((r) => r.id === ref.regionId);
    const city = region?.cities.find((c) => c.id === ref.cityId);
    if (region && city) out.push({ region, city });
  }
  return out;
}
