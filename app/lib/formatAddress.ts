import * as Location from 'expo-location';
import { formatCoords, hasValidCoords } from '@/lib/butcherLocation';

export type ResolvedAddress = {
  cityAr: string;
  addressAr: string;
};

export async function reverseGeocodeToAddress(
  lat: number,
  lng: number,
): Promise<ResolvedAddress | null> {
  try {
    const [geo] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!geo) return null;

    const cityAr =
      geo.city?.trim() ||
      geo.subregion?.trim() ||
      geo.region?.trim() ||
      geo.district?.trim() ||
      '';

    const streetParts = [geo.street, geo.streetNumber, geo.district, geo.name]
      .map((p) => p?.trim())
      .filter(Boolean);

    const addressAr =
      streetParts.join('، ') ||
      geo.formattedAddress?.trim() ||
      cityAr;

    if (!addressAr && !cityAr) return null;
    return { cityAr, addressAr: addressAr || cityAr };
  } catch {
    return null;
  }
}

export function formatLocationLabel(
  cityAr?: string | null,
  addressAr?: string | null,
  lat?: number | null,
  lng?: number | null,
): string {
  const city = cityAr?.trim();
  const address = addressAr?.trim();

  if (city && address && address !== city) {
    return `${city} · ${address}`;
  }
  if (address) return address;
  if (city) return city;
  if (hasValidCoords(lat, lng)) return formatCoords(lat!, lng!);
  return '';
}
