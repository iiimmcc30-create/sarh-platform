/**
 * Best-effort PII minimisation before text is sent to an external model.
 *
 * What it does: replaces obvious identifiers with stable pseudonyms such as
 * [PHONE_1] / [EMAIL_1] / [NATIONAL_ID_1] / [IQAMA_1] / [IBAN_1] / [CARD_1] /
 * [NUMBER_1]. The same value maps to the same pseudonym inside one
 * PiiPseudonymizer, so the model can still say "your number [PHONE_1]".
 * `restore()` puts the values back into the model's answer locally; the
 * mapping lives only in memory for that one request and is never logged,
 * stored, or sent anywhere.
 *
 * What it does NOT do (limits — do not claim full anonymisation):
 * - Names, addresses, plate numbers, free-text descriptions ("رقمي يبدأ بخمسة")
 *   and numbers spelled out in words are not detected.
 * - Numbers inside URLs are left as-is (URLs are kept intact on purpose).
 * - Unusual separators (dots, slashes, several spaces) between digits are not
 *   joined, so e.g. "050.123.4567" passes through.
 * - Any other run of 9+ digits becomes [NUMBER_n] (could hide a harmless
 *   reference number; the original stays in our database).
 * Arabic-Indic (٠-٩) and Persian (۰-۹) digits are converted to ASCII first.
 */

export type PiiKind =
  'EMAIL' | 'IBAN' | 'PHONE' | 'NATIONAL_ID' | 'IQAMA' | 'CARD' | 'NUMBER';

const ARABIC_INDIC_ZERO = 0x0660;
const PERSIAN_ZERO = 0x06f0;

export function normalizeDigits(text: string): string {
  return text.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const base = code >= PERSIAN_ZERO ? PERSIAN_ZERO : ARABIC_INDIC_ZERO;
    return String(code - base);
  });
}

const D = '(?:[ \\t-]?\\d)'; // one digit, optionally preceded by one space/tab/hyphen

/** Kept verbatim (never treated as PII): URLs, ticket numbers, UUIDs. */
const PROTECTED_RE = new RegExp(
  [
    'https?:\\/\\/[^\\s<>"\'\\]\\)]+',
    '\\bSRH-\\d{4}-\\d{6}\\b',
    '\\bSUP-[A-Z0-9]+-\\d{3}\\b',
    '\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b',
  ].join('|'),
  'g',
);

const EMAIL_RE =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** Saudi IBAN: SA + 22 digits/letters (24 chars), optional single spaces/hyphens. */
const IBAN_RE =
  /(?<![A-Za-z0-9])SA[ -]?\d{2}(?:[ -]?[A-Za-z0-9]){20}(?![A-Za-z0-9])/gi;

const PHONE_RES: RegExp[] = [
  // +966 / 00966, optional (0), mobile 5x or landline 1x
  new RegExp(
    `(?:\\+|00)[ -]?966[ -]?(?:\\(0\\)|0)?[ -]?[15]${D}{8}(?!\\d)`,
    'g',
  ),
  // 05xxxxxxxx (spaces / hyphens allowed)
  new RegExp(`(?<!\\d)05${D}{8}(?!\\d)`, 'g'),
  // Saudi landline 011..017 + 7 digits
  new RegExp(`(?<!\\d)01[1-7]${D}{7}(?!\\d)`, 'g'),
  // bare 9-digit mobile 5xxxxxxxx
  new RegExp(`(?<!\\d)5\\d${D}{7}(?!\\d)`, 'g'),
  // any other international number
  new RegExp(`(?:\\+|00)[1-9]${D}{7,14}(?!\\d)`, 'g'),
];

/** 10 digits starting with 1 (citizen) or 2 (resident / iqama). */
const SAUDI_ID_RE = new RegExp(`(?<!\\d)[12]${D}{9}(?!\\d)`, 'g');

const CARD_RE = new RegExp(`(?<!\\d)\\d${D}{12,18}(?!\\d)`, 'g');

const LONG_NUMBER_RE = new RegExp(`(?<!\\d)\\d${D}{8,}(?!\\d)`, 'g');

const TOKEN_RE = /\[(EMAIL|IBAN|PHONE|NATIONAL_ID|IQAMA|CARD|NUMBER)_(\d+)\]/g;

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

/** Canonical form so «+966 50…», «0096650…» and «050…» share one pseudonym. */
function canonicalPhone(raw: string): string {
  let d = digitsOnly(raw);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('9660')) d = `966${d.slice(4)}`;
  if (d.startsWith('966')) return d.slice(3);
  if (d.startsWith('0')) return d.slice(1);
  return d;
}

export class PiiPseudonymizer {
  private readonly tokenByKey = new Map<string, string>();
  private readonly valueByToken = new Map<string, string>();
  private readonly counters = new Map<PiiKind, number>();

  /** How many distinct values were replaced so far (for metrics, never values). */
  get replacedCount(): number {
    return this.valueByToken.size;
  }

  private tokenFor(kind: PiiKind, canonical: string, display: string): string {
    const key = `${kind}:${canonical}`;
    const existing = this.tokenByKey.get(key);
    if (existing) return existing;
    const n = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, n);
    const token = `[${kind}_${n}]`;
    this.tokenByKey.set(key, token);
    this.valueByToken.set(token, display);
    return token;
  }

  redact(input: string | null | undefined): string {
    if (!input) return '';
    let text = normalizeDigits(String(input));

    const protectedParts: string[] = [];
    text = text.replace(PROTECTED_RE, (m) => {
      protectedParts.push(m);
      return `\uE000${protectedParts.length - 1}\uE000`;
    });

    text = text.replace(EMAIL_RE, (m) =>
      this.tokenFor('EMAIL', m.toLowerCase(), m),
    );
    text = text.replace(IBAN_RE, (m) => {
      const canon = m.replace(/[ -]/g, '').toUpperCase();
      return this.tokenFor('IBAN', canon, m);
    });
    for (const re of PHONE_RES) {
      text = text.replace(re, (m) =>
        this.tokenFor('PHONE', canonicalPhone(m), m.trim()),
      );
    }
    text = text.replace(SAUDI_ID_RE, (m) => {
      const d = digitsOnly(m);
      return this.tokenFor(d.startsWith('1') ? 'NATIONAL_ID' : 'IQAMA', d, m);
    });
    text = text.replace(CARD_RE, (m) => {
      const d = digitsOnly(m);
      return luhnValid(d) ? this.tokenFor('CARD', d, m) : m;
    });
    text = text.replace(LONG_NUMBER_RE, (m) =>
      this.tokenFor('NUMBER', digitsOnly(m), m),
    );

    return text.replace(
      /\uE000(\d+)\uE000/g,
      (_m, i: string) => protectedParts[Number(i)] ?? '',
    );
  }

  /** Puts original values back into model output (local only). */
  restore(output: string | null | undefined): string {
    if (!output) return '';
    return String(output).replace(
      TOKEN_RE,
      (m) => this.valueByToken.get(m) ?? m,
    );
  }
}

/** One-shot helper when no restore is needed. */
export function redactPii(text: string | null | undefined): string {
  return new PiiPseudonymizer().redact(text);
}
