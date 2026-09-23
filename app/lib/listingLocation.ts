import * as Location from 'expo-location';
import { reverseGeocodeToAddress } from '@/lib/formatAddress';

export type ListingGeo = {
  latitude: number;
  longitude: number;
  city: string;
  region: string;
  country: string;
  formattedAddress: string;
};

export type LocationDetectStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'denied_forever'
  | 'unavailable'
  | 'geocode_failed'
  | 'ready'
  | 'manual';

export type LocationDetectResult = {
  status: LocationDetectStatus;
  geo: ListingGeo | null;
  message?: string;
};

function formatCityRegion(city?: string | null, region?: string | null): string {
  const c = city?.trim() ?? '';
  const r = region?.trim() ?? '';
  if (c && r && c !== r) return `${c}، ${r}`;
  return c || r;
}

export function formatListingAddress(geo: Partial<ListingGeo> | null | undefined): string {
  if (!geo) return '';
  if (geo.formattedAddress?.trim()) return geo.formattedAddress.trim();
  return formatCityRegion(geo.city, geo.region);
}

export async function detectCurrentListingLocation(): Promise<LocationDetectResult> {
  try {
    const existing = await Location.getForegroundPermissionsAsync();
    if (existing.status !== 'granted') {
      const asked = await Location.requestForegroundPermissionsAsync();
      if (asked.status !== 'granted') {
        const forever = asked.canAskAgain === false;
        return {
          status: forever ? 'denied_forever' : 'denied',
          geo: null,
          message: 'حدد موقع العرض يدوياً',
        };
      }
    }

    let pos: Location.LocationObject;
    try {
      pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
    } catch {
      return {
        status: 'unavailable',
        geo: null,
        message: 'تعذّر قراءة الموقع. حدد موقع العرض يدوياً',
      };
    }

    const latitude = Math.round(pos.coords.latitude * 1_000_000) / 1_000_000;
    const longitude = Math.round(pos.coords.longitude * 1_000_000) / 1_000_000;

    try {
      const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
      const resolved = await reverseGeocodeToAddress(latitude, longitude);
      const city =
        geo?.city?.trim() ||
        geo?.subregion?.trim() ||
        resolved?.cityAr ||
        '';
      const region = geo?.region?.trim() || geo?.subregion?.trim() || '';
      const country = geo?.isoCountryCode?.trim() || geo?.country?.trim() || 'SA';
      const formattedAddress =
        formatCityRegion(city, region) ||
        resolved?.addressAr ||
        resolved?.cityAr ||
        '';

      if (!formattedAddress) {
        return {
          status: 'geocode_failed',
          geo: {
            latitude,
            longitude,
            city,
            region,
            country,
            formattedAddress: '',
          },
          message: 'حدد موقع العرض يدوياً',
        };
      }

      return {
        status: 'ready',
        geo: {
          latitude,
          longitude,
          city,
          region,
          country,
          formattedAddress,
        },
      };
    } catch {
      return {
        status: 'geocode_failed',
        geo: {
          latitude,
          longitude,
          city: '',
          region: '',
          country: 'SA',
          formattedAddress: '',
        },
        message: 'حدد موقع العرض يدوياً',
      };
    }
  } catch {
    return {
      status: 'unavailable',
      geo: null,
      message: 'حدد موقع العرض يدوياً',
    };
  }
}
