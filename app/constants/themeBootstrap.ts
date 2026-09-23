import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { applyThemeScheme, type ColorScheme } from './theme';

export const THEME_STORAGE_KEY = 'safat_theme_preference';
export type ThemePreference = 'system' | 'light' | 'dark';

export function resolveScheme(preference: ThemePreference | null): ColorScheme {
  // Explicit light/dark win. "system" follows the OS.
  if (preference === 'light' || preference === 'dark') return preference;
  const system: ColorScheme = Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
  return system;
}

export async function bootstrapTheme(): Promise<ColorScheme> {
  const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
  // Product default is dark. Only honor an explicit stored preference.
  const preference =
    stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
  const scheme = resolveScheme(preference);
  applyThemeScheme(scheme);
  return scheme;
}
