export const DAFTRA_API_PREFIX = '/api2';
export const DAFTRA_DEFAULT_TIMEOUT_MS = 12_000;
export const DAFTRA_PRODUCT_PAGE_MAX = 100;
export const DAFTRA_PRODUCT_PAGE_DEFAULT = 20;

/** Documented Daftra API2 paths. Do not invent additional inventory list URLs. */
export const DAFTRA_PATHS = {
  apiKeyInfo: '/api_key_info.json',
  products: '/products.json',
  product: (id: number | string) => `/products/${id}.json`,
} as const;

export type DaftraFailureReason =
  | 'INVALID_API_KEY'
  | 'CONNECTION_FAILED'
  | 'NOT_CONFIGURED'
  | 'DISABLED'
  | 'DECRYPT_FAILED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'INVALID_RESPONSE';
