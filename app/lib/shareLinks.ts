// Public share links (sarhsa.online/l/<id>, /u/<username>, /post/<id>) → in-app routes.

/** Listing / post id from a shared link segment; null when it cannot be an id. */
export function shareLinkId(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? String(raw[0] ?? '').trim() : '';
  return /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
}

/** Username from a shared /u/ link (leading @ tolerated); null when invalid. */
export function shareLinkUsername(raw: unknown): string | null {
  const value = (typeof raw === 'string' ? raw : Array.isArray(raw) ? String(raw[0] ?? '') : '')
    .trim()
    .replace(/^@/, '');
  return /^[A-Za-z0-9_.]{1,40}$/.test(value) ? value : null;
}
