export const INTEGRATION_PROVIDERS = ['ni'] as const;
export type IntegrationProviderName = (typeof INTEGRATION_PROVIDERS)[number];

export const NI_PROVIDER = 'ni' as const;

/** HTTP statuses that must not be retried against NI. */
export const NI_NO_RETRY_STATUSES = new Set([400, 401, 403, 404, 422]);

/** Transient statuses eligible for exponential backoff. */
export const NI_RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export const NI_HTTP_TIMEOUT_MS = 15_000;
export const NI_AUTH_TIMEOUT_MS = 12_000;
export const NI_RETRY_ATTEMPTS = 3;
export const NI_RETRY_BASE_DELAY_MS = 400;

export const NI_IDEMPOTENCY_PREFIX = 'ni-checkout';
