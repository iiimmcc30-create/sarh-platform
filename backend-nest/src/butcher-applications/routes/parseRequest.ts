import { uuidSchema } from './schemas';

type QueryParams = Record<string, string | string[] | undefined>;
type HeaderValue = string | string[] | undefined;

export function parseApplicationId(query: QueryParams): string | null {
  const raw = query.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id || typeof id !== 'string') return null;

  const parsed = uuidSchema.safeParse(id);
  return parsed.success ? parsed.data : null;
}

export function parseDocumentId(query: QueryParams): string | null {
  const raw = query.documentId;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id || typeof id !== 'string') return null;

  const parsed = uuidSchema.safeParse(id);
  return parsed.success ? parsed.data : null;
}

export function parseIfUnmodifiedSinceHeader(
  raw: HeaderValue,
): Date | undefined | null {
  if (!raw) return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value?.trim()) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * Phase C: optional If-Unmodified-Since carrying the last known updatedAt (ISO-8601).
 * Returns undefined when absent; null when present but invalid.
 */
export function parseIfUnmodifiedSince(headers: {
  'if-unmodified-since'?: HeaderValue;
}): Date | undefined | null {
  return parseIfUnmodifiedSinceHeader(headers['if-unmodified-since']);
}
