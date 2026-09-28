import { normalizeArabicSearchText } from './arabic-search.util';

export type SuggestionKind =
  'listing' | 'service' | 'query' | 'hashtag' | 'term' | string;

export type Suggestion = { text: string; kind: SuggestionKind };

export type SuggestionSource = {
  kind: SuggestionKind;
  /** Higher = listed earlier within the merged interleave. */
  weight: number;
  items: string[];
  /** Max items taken from this source. */
  cap?: number;
};

/**
 * Merge typeahead sources (real listing titles, real past queries, trending
 * hashtags, dictionary terms / combos) into one de-duplicated list.
 * Sources are interleaved round-robin in weight order so no single source
 * floods the list; duplicates are removed by normalized text.
 */
export function mergeSuggestions(
  sources: SuggestionSource[],
  limit: number,
): Suggestion[] {
  const ordered = [...sources]
    .filter((s) => s.items.length > 0)
    .sort((a, b) => b.weight - a.weight)
    .map((s) => ({
      ...s,
      items: s.items.slice(0, s.cap ?? s.items.length),
      i: 0,
    }));
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  let progressed = true;
  while (out.length < limit && progressed) {
    progressed = false;
    for (const src of ordered) {
      while (src.i < src.items.length) {
        const text = src.items[src.i++].trim();
        const key = normalizeArabicSearchText(text) || text;
        if (!text || seen.has(key)) continue;
        seen.add(key);
        out.push({ text, kind: src.kind });
        progressed = true;
        break;
      }
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Items from `candidates` whose normalized form starts with (or contains) the prefix. */
export function matchPrefix(
  candidates: string[],
  prefix: string,
  allowContains = false,
): string[] {
  const p = normalizeArabicSearchText(prefix);
  if (!p) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const c of candidates) {
    const n = normalizeArabicSearchText(c);
    if (!n) continue;
    if (n.startsWith(p) || n.split(' ').some((w) => w.startsWith(p)))
      starts.push(c);
    else if (allowContains && n.includes(p)) contains.push(c);
  }
  return [...starts, ...contains];
}
