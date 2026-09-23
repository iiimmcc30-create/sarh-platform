import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyThemeScheme,
  colors,
  getActiveScheme,
  gradients,
  shadow,
  type ColorScheme,
} from '@/constants/theme';
import {
  resolveScheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '@/constants/themeBootstrap';

type ThemeContextValue = {
  preference: ThemePreference;
  scheme: ColorScheme;
  isDark: boolean;
  colors: typeof colors;
  gradients: typeof gradients;
  shadow: typeof shadow;
  setPreference: (preference: ThemePreference) => Promise<void>;
  setSchemeOverride: (scheme: ColorScheme | null) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('dark');
  const [scheme, setScheme] = useState<ColorScheme>(getActiveScheme());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        // Sarh brand default is dark. Migrate unset and legacy "system"
        // (which often resolves to light OS and paints white scenes).
        let nextPreference: ThemePreference = 'dark';
        if (stored === 'light' || stored === 'dark') {
          nextPreference = stored;
        } else {
          // unset | system | garbage → persist dark
          nextPreference = 'dark';
          await AsyncStorage.setItem(THEME_STORAGE_KEY, 'dark');
        }
        const resolved = resolveScheme(nextPreference);
        applyThemeScheme(resolved);
        if (!mounted) return;
        setPreferenceState(nextPreference);
        setScheme(resolved);
      } catch (error) {
        console.warn('[theme] failed to load preference', error);
        applyThemeScheme('dark');
        if (mounted) {
          setPreferenceState('dark');
          setScheme('dark');
        }
      } finally {
        if (mounted) setHydrated(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
        if (stored && stored !== 'system') return;
        const next: ColorScheme = colorScheme === 'light' ? 'light' : 'dark';
        if (next === getActiveScheme()) return;
        applyThemeScheme(next);
        setScheme(next);
      });
    });

    return () => subscription.remove();
  }, []);

  const setPreference = useCallback(async (next: ThemePreference) => {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, next);
    const resolved = resolveScheme(next);
    applyThemeScheme(resolved);
    setPreferenceState(next);
    setScheme(resolved);
  }, []);

  const setSchemeOverride = useCallback((next: ColorScheme | null) => {
    const resolved = next ?? resolveScheme(preference);
    applyThemeScheme(resolved);
    setScheme(resolved);
  }, [preference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      scheme,
      isDark: scheme === 'dark',
      colors,
      gradients,
      shadow,
      setPreference,
      setSchemeOverride,
    }),
    [preference, scheme, setPreference, setSchemeOverride],
  );

  return <ThemeContext.Provider value={value}>{hydrated ? children : null}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      preference: 'system' as ThemePreference,
      scheme: getActiveScheme(),
      isDark: getActiveScheme() === 'dark',
      colors,
      gradients,
      shadow,
      setPreference: async () => {},
      setSchemeOverride: () => {},
    };
  }
  return ctx;
}
