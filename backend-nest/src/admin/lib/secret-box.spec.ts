import { openSecret, sealSecret } from './secret-box';

describe('secret-box', () => {
  const prev = { ...process.env };
  afterEach(() => {
    process.env = { ...prev };
  });

  it('seals and opens with the JWT-derived key', () => {
    delete process.env.ADMIN_TOTP_ENC_KEY;
    process.env.JWT_SECRET = 'x'.repeat(40);
    const sealed = sealSecret('JBSWY3DPEHPK3PXP');
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(openSecret(sealed)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('fails to open with a different key (tamper / rotation)', () => {
    process.env.ADMIN_TOTP_ENC_KEY = 'a'.repeat(32);
    const sealed = sealSecret('SECRET');
    process.env.ADMIN_TOTP_ENC_KEY = 'b'.repeat(32);
    expect(() => openSecret(sealed)).toThrow();
  });

  it('rejects malformed input', () => {
    expect(() => openSecret('nope')).toThrow('bad_sealed_secret');
  });
});
