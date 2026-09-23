import { useFonts } from 'expo-font';
import {
  Tajawal_400Regular,
  Tajawal_500Medium,
  Tajawal_700Bold,
} from '@expo-google-fonts/tajawal';

/**
 * Loads app typeface Tajawal (400 / 500 / 700).
 * Icons are SVG — no Flaticon font preload.
 */
export function useFlaticonFonts() {
  const [loaded, error] = useFonts({
    Tajawal_400Regular,
    Tajawal_500Medium,
    Tajawal_700Bold,
  });
  return { loaded, error: error ?? null };
}
