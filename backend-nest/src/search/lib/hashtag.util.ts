/**
 * Hashtag extraction for trending + hashtag search.
 *
 * A hashtag is ONE token: `#` followed by letters (any script, incl. Arabic and
 * tatweel), combining marks, digits (Latin / Arabic-Indic) and underscores.
 * `#اذكرو_الله` is therefore a single tag - it is never split into `#اذكرو` /
 * `#الله`. Punctuation (Latin or Arabic: ، ؛ ؟ . ! ...) ends the tag.
 *
 * Root cause this replaces: the old code used `[\u0600-\u06FF\w_]`, which
 *  - swallowed Arabic punctuation inside the block (، ؛ ؟) into the tag,
 *  - missed Arabic letters outside U+0600-06FF (presentation forms, ZWNJ),
 * and the topic extractor stripped `_` (`[^\p{L}\p{N}\s]` -> space), so an
 * un-matched tag such as `اذكرو_الله` (no `#`, or a full-width `＃`) degraded
 * into the fragments `اذكرو` + `الله`, which then trended as separate topics.
 */

export type ExtractedHashtag = {
  /** Exactly as written in the text (including the leading `#`). */
  rawTag: string;
  /** What we show: `#` + body, trailing underscores trimmed. */
  displayTag: string;
  /** Match/merge key: folded Arabic, lower-case Latin, underscores kept. */
  normalizedTag: string;
  /** Number of `_`-separated words in the tag. */
  tokenCount: number;
};

// `#` or full-width `＃`, not preceded by a letter/digit/_/&/`/` (URL fragments,
// HTML entities, `abc#def`). Body = letters, marks, digits, `_`, ZWNJ/ZWJ.
const HASHTAG_RE =
  /(^|[^\p{L}\p{M}\p{N}_&/#＃])[#＃]([\p{L}\p{M}\p{N}_\u200C\u200D]+)/gu;

const TASHKEEL_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;

/** Fold a tag body for comparison. Never used for display. */
export function normalizeHashtagBody(body: string): string {
  return body
    .normalize('NFKC')
    .replace(TASHKEEL_RE, '')
    .replace(/[\u200C\u200D]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLocaleLowerCase('en');
}

function cleanBody(body: string): string {
  return body.replace(/[\u200C\u200D]+$/g, '').replace(/_+$/g, '');
}

/** All hashtags in `text`, in order, de-duplicated by normalized key. */
export function extractHashtagDetails(text: string): ExtractedHashtag[] {
  if (!text) return [];
  const out: ExtractedHashtag[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(HASHTAG_RE)) {
    const body = cleanBody(m[2]);
    // Must carry at least one letter; `#123` / `#___` are not topics.
    if (!/\p{L}/u.test(body)) continue;
    const normalizedBody = normalizeHashtagBody(body);
    if (!normalizedBody) continue;
    const normalizedTag = `#${normalizedBody}`;
    if (seen.has(normalizedTag)) continue;
    seen.add(normalizedTag);
    out.push({
      rawTag: `${m[0].slice(m[1].length)}`,
      displayTag: `#${body}`,
      normalizedTag,
      tokenCount: normalizedBody.split('_').filter(Boolean).length,
    });
  }
  return out;
}

/** Remove every hashtag from text (used before plain-word topic extraction). */
export function stripHashtags(text: string): string {
  if (!text) return '';
  return text.replace(HASHTAG_RE, (_all, lead: string) => `${lead} `);
}

/**
 * If the whole query is a single hashtag (`#حلال_الطيبين`), return it; else null.
 * Used so hashtag search matches the full tag rather than its parts.
 */
export function parseHashtagQuery(query: string): ExtractedHashtag | null {
  const trimmed = (query ?? '').trim();
  if (!/^[#＃]/.test(trimmed)) return null;
  const tags = extractHashtagDetails(trimmed);
  if (tags.length !== 1) return null;
  // Nothing but the tag itself (plus trailing punctuation/space).
  const rest = stripHashtags(trimmed).replace(/[\s\p{P}]/gu, '');
  return rest.length === 0 ? tags[0] : null;
}

/** True when `text` carries exactly this tag as a whole hashtag (not a prefix). */
export function textHasHashtag(text: string, normalizedTag: string): boolean {
  return extractHashtagDetails(text).some(
    (t) => t.normalizedTag === normalizedTag,
  );
}
