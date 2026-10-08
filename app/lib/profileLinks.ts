/**
 * Profile links (X-style links under the bio). Mirrors the backend rules in
 * backend-nest/src/users/lib/profile-links.ts: up to 3 links, http/https only,
 * "sarh.app/x" is saved as "https://sarh.app/x", optional short label.
 */
export type ProfileLink = { url: string; label?: string };

export const MAX_PROFILE_LINKS = 3;
export const MAX_PROFILE_LINK_URL = 200;
export const MAX_PROFILE_LINK_LABEL = 30;

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/** Normalized http(s) URL, or null when the value is not a valid web link. */
export function normalizeProfileLinkUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  if (!value || /\s/.test(value)) return null;
  if (!SCHEME_RE.test(value)) value = `https://${value.replace(/^\/+/, '')}`;
  if (value.length > MAX_PROFILE_LINK_URL) return null;
  const match = /^(https?):\/\/([^/?#]+)/i.exec(value);
  if (!match) return null;
  const authority = match[2];
  if (authority.includes('@')) return null;
  const host = authority.replace(/:\d+$/, '');
  if (!host.includes('.') || host.startsWith('.') || host.endsWith('.')) return null;
  if (/[\s<>"'`\\]/.test(host)) return null;
  return value;
}

/** X-style display: no scheme, no "www.", no trailing slash; long paths shortened. */
export function displayProfileLinkUrl(url: string, max = 32): string {
  let shown = url.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  shown = shown.replace(/\/+$/, '');
  if (shown.length > max) shown = `${shown.slice(0, max - 1)}…`;
  return shown;
}

/** Text shown on the profile: the label when set, else the cleaned URL. */
export function profileLinkText(link: ProfileLink): string {
  const label = link.label?.trim();
  return label ? label : displayProfileLinkUrl(link.url);
}

/** Defensive parse of the API `links` field. */
export function parseProfileLinks(raw: unknown): ProfileLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileLink[] = [];
  for (const row of raw) {
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

export type ProfileLinkDraft = { url: string; label: string };

/**
 * Validates the edit form. Empty rows are dropped; returns the list to save or
 * the first error (with the row index) in Arabic.
 */
export function validateProfileLinkDrafts(
  drafts: ProfileLinkDraft[],
): { ok: true; links: ProfileLink[] } | { ok: false; index: number; error: string } {
  const links: ProfileLink[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < drafts.length; i += 1) {
    const draft = drafts[i];
    const rawUrl = draft.url.trim();
    const label = draft.label.trim().replace(/\s+/g, ' ');
    if (!rawUrl) {
      if (label) return { ok: false, index: i, error: 'أدخل الرابط أو احذف الاسم' };
      continue;
    }
    const url = normalizeProfileLinkUrl(rawUrl);
    if (!url) return { ok: false, index: i, error: 'الرابط غير صالح، مثال: sarh.app' };
    if (label.length > MAX_PROFILE_LINK_LABEL) {
      return {
        ok: false,
        index: i,
        error: `اسم الرابط يجب ألا يتجاوز ${MAX_PROFILE_LINK_LABEL} حرفًا`,
      };
    }
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(label ? { url, label } : { url });
  }
  if (links.length > MAX_PROFILE_LINKS) {
    return { ok: false, index: MAX_PROFILE_LINKS, error: `الحد الأقصى ${MAX_PROFILE_LINKS} روابط` };
  }
  return { ok: true, links };
}

/** Edit-hub summary: first link (+N). */
export function profileLinksSummary(links: ProfileLink[] | undefined): string {
  if (!links?.length) return '';
  const first = profileLinkText(links[0]);
  return links.length > 1 ? `${first} +${links.length - 1}` : first;
}

export function sameProfileLinks(a: ProfileLink[], b: ProfileLink[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((l, i) => l.url === b[i].url && (l.label ?? '') === (b[i].label ?? ''));
}
