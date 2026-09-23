import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  normalizeAppLocale,
  type AppLocale,
} from '@/lib/locale';
import { getAuthCopy, type AuthCopy } from '@/constants/authCopy';

/** Auth UI copy driven by the app locale storage (ar RTL / en LTR). */
export function useAuthCopy(): { locale: AppLocale; copy: AuthCopy } {
  const [locale, setLocale] = useState<AppLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(LOCALE_STORAGE_KEY).then((raw) => {
      if (!alive) return;
      setLocale(normalizeAppLocale(raw));
    });
    return () => {
      alive = false;
    };
  }, []);

  return { locale, copy: getAuthCopy(locale) };
}
