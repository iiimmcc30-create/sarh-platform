import { haversineKm, isInSaudiBounds, roundCoord } from './geo-distance';
import type { SaudiCityMatcher } from './saudi-city-matcher';

/** A GPS point further than this from the chosen city is ignored (city centre used). */
export const GPS_MAX_KM_FROM_CITY = 60;

export type ListingGeoFields = {
  cityId: string;
  lat: number;
  lng: number;
  geoSource: 'CITY' | 'GPS';
};

export type ListingGeoInput = {
  cityId?: string | null;
  lat?: number | null;
  lng?: number | null;
  geoSource?: 'CITY' | 'GPS' | null;
};

export class InvalidCityError extends Error {
  constructor() {
    super('invalid_city');
  }
}

/**
 * Server-side geo for a create/update. With cityId: validate it; GPS coords (inside
 * KSA, re-rounded to 2 decimals ≈ 1 km) are kept only when geoSource=GPS and they are
 * within 60 km of that city, otherwise the city centre is used. Without cityId the
 * free-text location is matched to a city. Returns null when nothing resolves.
 */
export function resolveListingGeo(
  matcher: SaudiCityMatcher,
  input: ListingGeoInput,
  locationTexts: Array<string | null | undefined>,
): ListingGeoFields | null {
  if (input.cityId) {
    const city = matcher.byId.get(input.cityId);
    if (!city) throw new InvalidCityError();
    const lat = input.lat;
    const lng = input.lng;
    if (
      input.geoSource === 'GPS' &&
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      isInSaudiBounds(lat, lng)
    ) {
      const rLat = roundCoord(lat);
      const rLng = roundCoord(lng);
      if (haversineKm(rLat, rLng, city.lat, city.lng) <= GPS_MAX_KM_FROM_CITY) {
        return { cityId: city.id, lat: rLat, lng: rLng, geoSource: 'GPS' };
      }
    }
    return { cityId: city.id, lat: city.lat, lng: city.lng, geoSource: 'CITY' };
  }
  const match = matcher.match(...locationTexts);
  if (!match) return null;
  return {
    cityId: match.city.id,
    lat: match.city.lat,
    lng: match.city.lng,
    geoSource: 'CITY',
  };
}
