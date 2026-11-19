/** Client twin of the server parser. Handles are lowercase latin, digits and _. */
export type RichToken =
  | { kind: 'text'; text: string }
  | { kind: 'hashtag'; text: string }
  | { kind: 'mention'; text: string; username: string };

export function tokenizeRichText(text: string): RichToken[] {
  if (!text) return [];
  const re = /(@[A-Za-z0-9_]{3,30})|(#[\u0600-\u06FFa-zA-Z0-9_]+)/g;
  const tokens: RichToken[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[1]) {
      const prev = match.index === 0 ? '' : text[match.index - 1];
      if (prev && /[A-Za-z0-9_]/.test(prev)) continue;
    }
    if (match.index > last) tokens.push({ kind: 'text', text: text.slice(last, match.index) });
    if (match[1]) {
      const username = match[1].slice(1).toLowerCase();
      tokens.push({ kind: 'mention', text: `\u2066@${username}\u2069`, username });
    } else {
      tokens.push({ kind: 'hashtag', text: match[2] });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) tokens.push({ kind: 'text', text: text.slice(last) });
  if (tokens.length === 0) tokens.push({ kind: 'text', text });
  return tokens;
}

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
  return { text: `${text.slice(0, start)}${handle}${text.slice(caret)}`, caret: start + handle.length };
}
