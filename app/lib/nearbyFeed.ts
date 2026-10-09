import {
  DEFAULT_NEARBY_RADIUS_KM,
  NEARBY_RADII_KM,
  type NearbyRadiusKm,
  type SaudiCityEntry,
} from '@/lib/saudiCities';
import type { ListingSearchParams } from '@/services/listings';

/** Where «القريب» measures from: the (rounded) device point or a picked city centre. */
export type NearbyOrigin =
  | { kind: 'gps'; lat: number; lng: number; city: SaudiCityEntry }
  | { kind: 'city'; city: SaudiCityEntry };

export type NearbyState = {
  origin: NearbyOrigin;
  radiusKm: NearbyRadiusKm;
  nearestFirst: boolean;
};

export function initialNearbyState(origin: NearbyOrigin): NearbyState {
  return { origin, radiusKm: DEFAULT_NEARBY_RADIUS_KM, nearestFirst: true };
}

/** Server params for the radius feed (replaces the old client-side city text filter). */
export function nearbyApiParams(
  state: NearbyState | null,
): Pick<ListingSearchParams, 'near' | 'nearCityId' | 'radiusKm' | 'sort'> {
  if (!state) return {};
  const base =
    state.origin.kind === 'gps'
      ? { near: { lat: state.origin.lat, lng: state.origin.lng } }
      : { nearCityId: state.origin.city.id };
  return {
    ...base,
    radiusKm: state.radiusKm,
    sort: state.nearestFirst ? 'nearest' : undefined,
  };
}

export type NearbyChip =
  | { key: string; kind: 'radius'; radiusKm: NearbyRadiusKm; label: string; selected: boolean }
  | { key: 'nearest'; kind: 'nearest'; label: string; selected: boolean };

/** Chip row model: 25/50/100/200 كم (one selected) + «الأقرب أولاً» toggle. */
export function nearbyChips(state: NearbyState): NearbyChip[] {
  const radius: NearbyChip[] = NEARBY_RADII_KM.map((km) => ({
    key: `r${km}`,
    kind: 'radius' as const,
    radiusKm: km,
    label: `${km} كم`,
    selected: state.radiusKm === km,
  }));
  return [
    ...radius,
    { key: 'nearest', kind: 'nearest', label: 'الأقرب أولاً', selected: state.nearestFirst },
  ];
}

export function applyNearbyChip(state: NearbyState, chip: NearbyChip): NearbyState {
  if (chip.kind === 'radius') return { ...state, radiusKm: chip.radiusKm };
  return { ...state, nearestFirst: !state.nearestFirst };
}

/** Label of the origin chip: «قربك · الرس» for GPS, «الرس» for a picked city. */
export function nearbyOriginLabel(origin: NearbyOrigin): string {
  return origin.kind === 'gps' ? `قربك · ${origin.city.nameAr}` : origin.city.nameAr;
}
