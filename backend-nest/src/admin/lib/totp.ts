import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — compatible with Google
 * Authenticator, Microsoft Authenticator, 1Password, Authy, etc.
 * Implemented on node:crypto to avoid a new dependency.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_PERIOD_SEC = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('invalid_base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit secret, base32 (what authenticator apps expect). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SEC);
}

export function hotp(secretB32: string, counter: number): string {
  const key = base32Decode(secretB32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(msg).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function normalizeOtp(code: unknown): string | null {
  if (typeof code !== 'string' && typeof code !== 'number') return null;
  // Accept Arabic-Indic digits typed on an Arabic keyboard.
  const s = String(code)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\s+/g, '');
  return /^\d{6}$/.test(s) ? s : null;
}

/**
 * Verify a code within ±`window` steps. Returns the matched step (store it as
 * `lastUsedStep` to block replays) or null. Steps <= `afterStep` are rejected.
 */
export function verifyTotp(
  secretB32: string,
  code: unknown,
  opts: { nowMs?: number; window?: number; afterStep?: number | null } = {},
): number | null {
  const normalized = normalizeOtp(code);
  if (!normalized) return null;
  const current = totpStep(opts.nowMs);
  const window = opts.window ?? 1;
  const candidate = Buffer.from(normalized);
  for (let delta = -window; delta <= window; delta += 1) {
    const step = current + delta;
    if (opts.afterStep != null && step <= opts.afterStep) continue;
    const expected = Buffer.from(hotp(secretB32, step));
    if (timingSafeEqual(expected, candidate)) return step;
  }
  return null;
}

export function buildOtpAuthUrl(
  secretB32: string,
  account: string,
  issuer = 'Sarh Admin',
): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretB32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SEC),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
