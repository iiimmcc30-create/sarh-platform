/** Arabic/Latin normalization for search matching only — never mutates stored values. */

const TASHKEEL_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const DIACRITICS_RE = /[\u0300-\u036f]/g;

const ARABIC_ALEF_VARIANTS: Record<string, string> = {
  '\u0623': '\u0627', // أ
  '\u0625': '\u0627', // إ
  '\u0622': '\u0627', // آ
  '\u0671': '\u0627', // ٱ
};

const ALEF_FORMS = ['\u0627', '\u0623', '\u0625', '\u0622', '\u0671'] as const;
const ALEF_CLASS_RE = /[اأإآٱ]/;

const MAX_SEARCH_VARIANTS = 24;
const MAX_SEARCH_TOKENS = 8;

/** Normalize text for comparison (not for persistence). */
export function normalizeArabicSearchText(input: string): string {
  if (!input) return '';

  let text = input.normalize('NFKC');
  text = text.replace(TASHKEEL_RE, '').replace(DIACRITICS_RE, '');

  let out = '';
  for (const ch of text) {
    out += ARABIC_ALEF_VARIANTS[ch] ?? ch;
  }

  out = out
    .replace(/\u0649/g, '\u064A') // ى → ي
    .replace(/\u0629/g, '\u0647') // ة → ه (match-only)
    .replace(/\u0640/g, '') // tatweel
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ar');

  return out;
}

/** Split query into meaningful tokens (min length enforced by caller). */
export function tokenizeSearchQuery(query: string): string[] {
  const normalized = normalizeArabicSearchText(query);
  if (!normalized) return [];

  const tokens = normalized.split(/\s+/).filter((t) => t.length >= 2);
  return [...new Set(tokens)].slice(0, MAX_SEARCH_TOKENS);
}

/**
 * Expand alef forms so a normalized query token can match DB text that still
 * stores أ / إ / آ / ٱ (PostgreSQL `contains` is literal).
 */
function expandAlefLookupForms(
  text: string,
  maxVariants = MAX_SEARCH_VARIANTS,
): string[] {
  if (!ALEF_CLASS_RE.test(text)) return [text];

  const out = new Set<string>([text]);
  const queue = [text];

  while (queue.length > 0 && out.size < maxVariants) {
    const cur = queue.shift()!;
    for (let i = 0; i < cur.length; i += 1) {
      if (!ALEF_FORMS.includes(cur[i] as (typeof ALEF_FORMS)[number])) continue;
      for (const form of ALEF_FORMS) {
        if (form === cur[i]) continue;
        const next = `${cur.slice(0, i)}${form}${cur.slice(i + 1)}`;
        if (out.has(next)) continue;
        out.add(next);
        queue.push(next);
        if (out.size >= maxVariants) break;
      }
      if (out.size >= maxVariants) break;
    }
  }

  return [...out];
}

function expandTaYaLookupForms(text: string): string[] {
  const variants = new Set<string>([text]);
  if (text.includes('\u0647')) {
    variants.add(text.replace(/\u0647/g, '\u0629')); // ه → ة
  }
  if (text.includes('\u0629')) {
    variants.add(text.replace(/\u0629/g, '\u0647')); // ة → ه
  }
  if (text.includes('\u064A')) {
    variants.add(text.replace(/\u064A/g, '\u0649')); // ي → ى
  }
  if (text.includes('\u0649')) {
    variants.add(text.replace(/\u0649/g, '\u064A')); // ى → ي
  }
  return [...variants];
}

/** Variants for tolerant Arabic matching against raw DB text. */
export function searchTextVariants(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const normalized = normalizeArabicSearchText(trimmed);
  const seeds = new Set<string>([trimmed, normalized].filter(Boolean));

  const variants = new Set<string>();
  for (const seed of seeds) {
    for (const alefForm of expandAlefLookupForms(seed)) {
      for (const form of expandTaYaLookupForms(alefForm)) {
        variants.add(form);
        if (variants.size >= MAX_SEARCH_VARIANTS) {
          return [...variants];
        }
      }
    }
  }

  return [...variants].filter(Boolean);
}

export function isBlankSearchQuery(query: string): boolean {
  return normalizeArabicSearchText(query).length === 0;
}

export function clampSearchQuery(query: string, maxLen = 120): string {
  return query.trim().slice(0, maxLen);
}
