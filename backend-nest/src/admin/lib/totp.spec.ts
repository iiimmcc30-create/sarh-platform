import {
  base32Decode,
  base32Encode,
  buildOtpAuthUrl,
  generateTotpSecret,
  hotp,
  normalizeOtp,
  totpStep,
  verifyTotp,
} from './totp';

// RFC 6238 Appendix B (SHA-1 seed "12345678901234567890"), last 6 digits.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
  it('base32 round-trips and matches the RFC seed encoding', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(RFC_SECRET).toString()).toBe('12345678901234567890');
  });

  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches RFC vector at T=%i', (t, code) => {
    expect(hotp(RFC_SECRET, totpStep(t * 1000))).toBe(code);
  });

  it('verifies within ±1 step and returns the matched step', () => {
    const now = 1234567890 * 1000;
    const step = totpStep(now);
    expect(verifyTotp(RFC_SECRET, '005924', { nowMs: now })).toBe(step);
    const prev = hotp(RFC_SECRET, step - 1);
    expect(verifyTotp(RFC_SECRET, prev, { nowMs: now })).toBe(step - 1);
    const far = hotp(RFC_SECRET, step - 3);
    expect(verifyTotp(RFC_SECRET, far, { nowMs: now })).toBeNull();
  });

  it('blocks replay of an already-used step', () => {
    const now = 1234567890 * 1000;
    const step = totpStep(now);
    expect(
      verifyTotp(RFC_SECRET, '005924', { nowMs: now, afterStep: step }),
    ).toBeNull();
  });

  it('normalizes Arabic-Indic digits and rejects junk', () => {
    expect(normalizeOtp('٠٠٥٩٢٤')).toBe('005924');
    expect(normalizeOtp(' 005 924 ')).toBe('005924');
    expect(normalizeOtp('12345')).toBeNull();
    expect(normalizeOtp(undefined)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef')).toBeNull();
  });

  it('generates 32-char base32 secrets and an otpauth URL', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const url = buildOtpAuthUrl(secret, 'admin');
    expect(url.startsWith('otpauth://totp/Sarh%20Admin%3Aadmin?')).toBe(true);
    expect(url).toContain(`secret=${secret}`);
    expect(url).toContain('issuer=Sarh+Admin');
  });
});
