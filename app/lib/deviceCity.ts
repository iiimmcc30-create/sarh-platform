import * as Location from 'expo-location';
import { nearestSaudiCity, roundCoord2, type SaudiCityEntry } from '@/lib/saudiCities';

/** A device point farther than this from every city centre is treated as outside KSA. */
export const MAX_KM_TO_NEAREST_CITY = 120;
/** Session-only cache (memory, never persisted or sent anywhere but the query). */
const SESSION_TTL_MS = 10 * 60_000;

export type DeviceCityResult =
  | { status: 'ok'; lat: number; lng: number; city: SaudiCityEntry; km: number }
  | { status: 'denied'; canAskAgain: boolean }
  | { status: 'unavailable' }
  | { status: 'outside' };

let sessionPoint: { at: number; result: Extract<DeviceCityResult, { status: 'ok' }> } | null = null;

export function __resetDeviceCityCache() {
  sessionPoint = null;
}

/** Pure part (tested): device point → rounded point + nearest city, or outside. */
export function resolveDevicePoint(lat: number, lng: number): DeviceCityResult {
  const near = nearestSaudiCity(lat, lng);
  if (!near || near.km > MAX_KM_TO_NEAREST_CITY) return { status: 'outside' };
  return { status: 'ok', lat: roundCoord2(lat), lng: roundCoord2(lng), city: near.city, km: near.km };
}

/**
 * Foreground permission → current position → nearest city from the shared table
 * (haversine on device, no reverse geocoding). Coordinates are rounded to 2 decimals.
 */
export async function detectDeviceCity(opts: { useCache?: boolean } = {}): Promise<DeviceCityResult> {
  if (opts.useCache !== false && sessionPoint && Date.now() - sessionPoint.at < SESSION_TTL_MS) {
    return sessionPoint.result;
  }
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        return { status: 'denied', canAskAgain: perm.canAskAgain !== false };
      }
    }
    let pos: Location.LocationObject | null = null;
    try {
      pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    } catch {
      pos = await Location.getLastKnownPositionAsync().catch(() => null);
    }
    if (!pos) return { status: 'unavailable' };
    const result = resolveDevicePoint(pos.coords.latitude, pos.coords.longitude);
    if (result.status === 'ok') sessionPoint = { at: Date.now(), result };
    return result;
  } catch {
    return { status: 'unavailable' };
  }
}
