import { Platform } from 'react-native';

/**
 * Native MapView crashes on Android when Google Maps SDK is not configured
 * in AndroidManifest (com.google.android.geo.API_KEY).
 * Keep disabled until EXPO_PUBLIC_MAPS_ENABLED=true AND API key is set + prebuild.
 */
export function isNativeMapsEnabled(): boolean {
  if (Platform.OS === 'web') return false;
  if (process.env.EXPO_PUBLIC_MAPS_ENABLED !== 'true') return false;
  const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return !!key;
}
