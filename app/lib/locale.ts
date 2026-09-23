/** App UI locale — Arabic (RTL) default; English and others use LTR layout. */
export type AppLocale = 'ar' | 'en';

export const LOCALE_STORAGE_KEY = 'safat:app_locale';
export const DEFAULT_LOCALE: AppLocale = 'ar';

export function localeUsesRtl(locale: AppLocale): boolean {
  return locale === 'ar';
}

export function normalizeAppLocale(raw: string | null | undefined): AppLocale {
  if (raw === 'en') return 'en';
  return 'ar';
}
