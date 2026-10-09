/**
 * Normalization for Saudi place names so spelling variants meet on one key:
 * المزاحمية / المزاحميه / مزاحمية, حفر الباطن / حفرالباطن, ضرماء / ضرما,
 * أبها / ابها, diacritics and tatweel, "محافظة …" prefixes, ", منطقة …" suffixes.
 */
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u200c-\u200f]/g;

export function normalizeArabicPlace(input: string | null | undefined): string {
  let s = String(input ?? '').trim();
  if (!s) return '';
  s = s.replace(DIACRITICS, '');
  s = s
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase();
  // Administrative prefixes ("محافظة الخرج", "مدينة بريدة", "منطقة القصيم").
  s = s.replace(/^\s*(محافظه|مدينه|منطقه|مركز|بلده|قريه)\s+/, '');
  // Trailing hamza after alef is often dropped (ضرماء/ضرما, بقعاء/بقعا, تيماء/تيما).
  s = s.replace(/اء(?=\s|$)/g, 'ا');
  // Separators and punctuation.
  s = s.replace(/[\s\-_.,،()/\\'"`]+/g, '');
  // Leading definite article (الرس → رس) and english al-/ar- prefixes.
  if (s.startsWith('ال') && s.length > 3) s = s.slice(2);
  s = s.replace(/^(al|ar|as|ash|ad|adh|at|az|an|ath|el)(?=[a-z]{3,})/, '');
  return s;
}

/**
 * Candidate pieces of a free-text location ("الرس، القصيم", "حي النخيل - بريدة",
 * "Riyadh, Saudi Arabia"): the whole string first, then each comma/dash part.
 */
export function locationCandidates(input: string | null | undefined): string[] {
  const raw = String(input ?? '').trim();
  if (!raw) return [];
  const parts = raw
    .split(/[,،\-–|/]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [raw];
  for (const p of parts) if (!out.includes(p)) out.push(p);
  return out;
}
