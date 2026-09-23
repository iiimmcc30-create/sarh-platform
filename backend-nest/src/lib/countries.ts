export const SUPPORTED_COUNTRIES = [
  'SA',
  'AE',
  'KW',
  'QA',
  'BH',
  'OM',
  'EG',
] as const;

export type SupportedCountry = (typeof SUPPORTED_COUNTRIES)[number];
