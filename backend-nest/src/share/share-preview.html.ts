// Open Graph HTML for link-preview crawlers (WhatsApp, X, Telegram, iMessage…).
// Pure helpers: no DB, no I/O — the controller feeds them.

export const SHARE_SITE = 'https://sarhsa.online';
export const SHARE_SITE_NAME = 'سرح';
export const SHARE_DEFAULT_IMAGE = `${SHARE_SITE}/icon-512.png`;
export const SHARE_DEFAULT_DESCRIPTION =
  'سرح — المنصة الوطنية للثروة الحيوانية';

export type SharePreview = {
  /** Canonical public URL (the same /l/, /post/, /u/ link that was shared). */
  url: string;
  title: string;
  description: string;
  image?: string | null;
  type?: 'website' | 'article' | 'profile' | 'product';
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Collapse whitespace and cut to `max` characters (adds an ellipsis). */
export function clip(value: string | null | undefined, max: number): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

const CLOUDINARY_UPLOAD =
  /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/i;

/**
 * Absolute preview image: Cloudinary images get a 1200px-wide JPEG delivery
 * (WhatsApp wants a small-ish jpg/png), relative uploads become absolute,
 * anything else (videos, missing) falls back to the Sarh icon.
 */
export function previewImageUrl(raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return SHARE_DEFAULT_IMAGE;
  if (value.startsWith('/')) return `${SHARE_SITE}${value}`;
  if (!/^https?:\/\//i.test(value)) return SHARE_DEFAULT_IMAGE;
  const match = value.match(CLOUDINARY_UPLOAD);
  if (!match)
    return /\/video\/upload\//i.test(value) ? SHARE_DEFAULT_IMAGE : value;
  return `${match[1]}w_1200,c_limit,q_auto,f_jpg/${match[2]}`;
}

export function formatPriceAr(
  price: number | null | undefined,
  currency?: string | null,
): string | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  const cur = (currency || 'SAR').toUpperCase();
  const label = cur === 'SAR' ? 'ريال' : cur;
  return `${Math.round(price).toLocaleString('en-US')} ${label}`;
}

export function renderSharePreview(p: SharePreview): string {
  const title = escapeHtml(clip(p.title, 90) || SHARE_SITE_NAME);
  const description = escapeHtml(
    clip(p.description, 200) || SHARE_DEFAULT_DESCRIPTION,
  );
  const image = escapeHtml(previewImageUrl(p.image));
  const url = escapeHtml(p.url);
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${description}" />
<link rel="canonical" href="${url}" />
<meta property="og:site_name" content="${SHARE_SITE_NAME}" />
<meta property="og:locale" content="ar_SA" />
<meta property="og:type" content="${p.type ?? 'website'}" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${image}" />
<meta property="og:image:alt" content="${title}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />
</head>
<body>
<h1>${title}</h1>
<p>${description}</p>
<p><a href="${url}">${url}</a></p>
</body>
</html>`;
}
