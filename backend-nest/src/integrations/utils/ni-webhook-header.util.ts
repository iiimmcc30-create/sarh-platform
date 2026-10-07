import crypto from 'crypto';

/**
 * N-Genius webhooks are NOT signed. The portal (Settings → Integrations →
 * Webhooks) lets you set a static "Header Key" / "Header Value"; we expect
 * that header to carry NI_WEBHOOK_SECRET.
 *
 * Header name: NI_WEBHOOK_HEADER (optional), default `x-sarh-webhook-secret`.
 */
export const DEFAULT_NI_WEBHOOK_HEADER = 'x-sarh-webhook-secret';

export function niWebhookHeaderName(): string {
  const raw = process.env.NI_WEBHOOK_HEADER?.trim().toLowerCase();
  return raw || DEFAULT_NI_WEBHOOK_HEADER;
}

/** Reads the fixed-secret header from an incoming request (never logged). */
export function readNiWebhookFixedHeader(req: {
  headers?: Record<string, string | string[] | undefined>;
}): string | undefined {
  const value = req?.headers?.[niWebhookHeaderName()];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' && first.length ? first : undefined;
}

/** Constant-time comparison of the fixed header value with the secret. */
export function niFixedSecretMatches(
  provided: string | undefined,
  secret: string | undefined,
): boolean {
  const a = Buffer.from((provided ?? '').trim(), 'utf8');
  const b = Buffer.from((secret ?? '').trim(), 'utf8');
  if (!a.length || !b.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
