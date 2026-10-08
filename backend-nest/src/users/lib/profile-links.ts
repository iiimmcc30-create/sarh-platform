/**
 * Profile links (X-style «website» under the bio, up to MAX_PROFILE_LINKS).
 *
 * Stored on `User.profileLinks` (JSONB array of `{ url, label? }`). Accounts that
 * never saved links (`profileLinks` null) fall back to the legacy `User.website`
 * column (e.g. official accounts managed from the admin panel).
 */
export const MAX_PROFILE_LINKS = 3;
export const MAX_PROFILE_LINK_URL = 200;
export const MAX_PROFILE_LINK_LABEL = 30;

export type ProfileLink = { url: string; label?: string };

export type ProfileLinksResult =
  | { ok: true; links: ProfileLink[] }
  | { ok: false; messageAr: string };

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Normalizes one URL: trims, prepends https:// when no scheme is given
 * ("sarh.app/x" → "https://sarh.app/x"), then accepts http/https only with a
 * real dotted host. Returns null when invalid.
 */
export function normalizeProfileLinkUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  if (!value || /\s/.test(value)) return null;
  if (!SCHEME_RE.test(value)) value = `https://${value.replace(/^\/+/, '')}`;
  if (value.length > MAX_PROFILE_LINK_URL) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  const host = parsed.hostname;
  if (!host || !host.includes('.') || host.startsWith('.') || host.endsWith('.')) {
    return null;
  }
  return value;
}

/** Validates + normalizes the client list (dedupes by URL, drops empty rows). */
export function normalizeProfileLinks(input: unknown): ProfileLinksResult {
  if (input === null || input === undefined) return { ok: true, links: [] };
  if (!Array.isArray(input)) {
    return { ok: false, messageAr: 'صيغة الروابط غير صحيحة' };
  }
  const links: ProfileLink[] = [];
  const seen = new Set<string>();
  for (const row of input) {
    const rawUrl =
      row && typeof row === 'object' ? (row as { url?: unknown }).url : undefined;
    const rawLabel =
      row && typeof row === 'object' ? (row as { label?: unknown }).label : undefined;
    if (typeof rawUrl === 'string' && !rawUrl.trim()) continue;
    const url = normalizeProfileLinkUrl(rawUrl);
    if (!url) {
      return { ok: false, messageAr: 'الرابط غير صالح، استخدم رابطًا يبدأ بـ https://' };
    }
    if (rawLabel !== undefined && rawLabel !== null && typeof rawLabel !== 'string') {
      return { ok: false, messageAr: 'اسم الرابط غير صالح' };
    }
    const label = typeof rawLabel === 'string' ? rawLabel.trim().replace(/\s+/g, ' ') : '';
    if (label.length > MAX_PROFILE_LINK_LABEL) {
      return {
        ok: false,
        messageAr: `اسم الرابط يجب ألا يتجاوز ${MAX_PROFILE_LINK_LABEL} حرفًا`,
      };
    }
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(label ? { url, label } : { url });
  }
  if (links.length > MAX_PROFILE_LINKS) {
    return { ok: false, messageAr: `الحد الأقصى ${MAX_PROFILE_LINKS} روابط` };
  }
  return { ok: true, links };
}

/** Public read: stored links (re-validated defensively) or the legacy website. */
export function readProfileLinks(
  stored: unknown,
  legacyWebsite?: string | null,
): ProfileLink[] {
  if (Array.isArray(stored)) {
    const out: ProfileLink[] = [];
    for (const row of stored) {
      if (!row || typeof row !== 'object') continue;
      const url = normalizeProfileLinkUrl((row as { url?: unknown }).url);
      if (!url) continue;
      const label = (row as { label?: unknown }).label;
      out.push(
        typeof label === 'string' && label.trim()
          ? { url, label: label.trim().slice(0, MAX_PROFILE_LINK_LABEL) }
          : { url },
      );
      if (out.length >= MAX_PROFILE_LINKS) break;
    }
    return out;
  }
  const website = normalizeProfileLinkUrl(legacyWebsite);
  return website ? [{ url: website }] : [];
}
