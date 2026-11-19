/** @username handles are lowercase latin, digits and underscore (signup rule). */
export const MENTION_LIMIT = 10;
const HANDLE = /^[a-z0-9_]{3,30}$/;

export type ParsedMention = { username: string; index: number };

/**
 * Usernames in order of appearance, de-duplicated, capped.
 * The character before @ must not be a handle character, so emails are skipped.
 */
export function parseMentions(text: string, limit = MENTION_LIMIT): string[] {
  if (!text) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  const re = /@([A-Za-z0-9_]{3,30})/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const at = match.index;
    const prev = at === 0 ? '' : text[at - 1];
    if (prev && /[A-Za-z0-9_]/.test(prev)) continue;
    const username = match[1].toLowerCase();
    if (!HANDLE.test(username) || seen.has(username)) continue;
    seen.add(username);
    found.push(username);
    if (found.length >= limit) break;
  }
  return found;
}

/** Merge several fields into one capped, de-duplicated handle list. */
export function parseMentionTexts(
  texts: Array<string | null | undefined>,
  limit = MENTION_LIMIT,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const username of parseMentions(text, limit)) {
      if (seen.has(username)) continue;
      seen.add(username);
      out.push(username);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export type RichToken =
  | { kind: 'text'; text: string }
  | { kind: 'hashtag'; text: string }
  | { kind: 'mention'; text: string; username: string };

/** Split visible text into plain runs, hashtags and @mentions (RTL-safe). */
export function tokenizeRichText(text: string): RichToken[] {
  if (!text) return [];
  const re = /(@[A-Za-z0-9_]{3,30})|(#[\u0600-\u06FFa-zA-Z0-9_]+)/g;
  const tokens: RichToken[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[1]) {
      const at = match.index;
      const prev = at === 0 ? '' : text[at - 1];
      if (prev && /[A-Za-z0-9_]/.test(prev)) continue;
    }
    if (match.index > last) {
      tokens.push({ kind: 'text', text: text.slice(last, match.index) });
    }
    if (match[1]) {
      const username = match[1].slice(1).toLowerCase();
      tokens.push({
        kind: 'mention',
        text: `\u2066@${username}\u2069`,
        username,
      });
    } else {
      tokens.push({ kind: 'hashtag', text: match[2] });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) tokens.push({ kind: 'text', text: text.slice(last) });
  if (tokens.length === 0) tokens.push({ kind: 'text', text });
  return tokens;
}

/** The @query being typed at the caret, if any. */
export function activeMentionQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const upto = Math.max(0, Math.min(caret, text.length));
  const slice = text.slice(0, upto);
  const at = slice.lastIndexOf('@');
  if (at < 0) return null;
  const prev = at === 0 ? '' : slice[at - 1];
  if (prev && /[A-Za-z0-9_]/.test(prev)) return null;
  const query = slice.slice(at + 1);
  if (!/^[A-Za-z0-9_]{0,30}$/.test(query)) return null;
  return { start: at, query: query.toLowerCase() };
}

export function insertMention(
  text: string,
  start: number,
  caret: number,
  username: string,
): { text: string; caret: number } {
  const handle = `@${username.toLowerCase()} `;
  const next = `${text.slice(0, start)}${handle}${text.slice(caret)}`;
  const pos = start + handle.length;
  return { text: next, caret: pos };
}
