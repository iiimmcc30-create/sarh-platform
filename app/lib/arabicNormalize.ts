/**
 * Safe Arabic normalization for marketplace matching.
 * Does not change user-facing strings — only comparison keys.
 */
export function normalizeArabic(input: string): string {
  return input
    .normalize('NFC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // tashkeel + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function tokenizeArabic(input: string): string[] {
  const normalized = normalizeArabic(input);
  if (!normalized) return [];
  return normalized.split(' ').filter((t) => t.length > 1);
}

export function includesNormalized(haystack: string, needle: string): boolean {
  const h = normalizeArabic(haystack);
  const n = normalizeArabic(needle);
  return !!n && h.includes(n);
}
