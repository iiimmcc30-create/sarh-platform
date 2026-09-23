import {
  decryptSecret,
  encryptSecret,
  maskSecretLast4,
  secretLast4,
} from './secret-encryption';

describe('secret encryption', () => {
  const prev = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'x'.repeat(32);
    delete process.env.SECRETS_ENCRYPTION_KEY;
  });

  afterAll(() => {
    process.env.JWT_SECRET = prev;
  });

  it('round-trips a secret', () => {
    const secret = 'daftra-api-key-1234567890';
    const enc = encryptSecret(secret);
    expect(enc.ciphertext).not.toContain(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it('masks last4 without revealing the key', () => {
    expect(secretLast4('abcdefghijklmnop')).toBe('mnop');
    expect(maskSecretLast4('mnop')).toBe('••••••••••••mnop');
    expect(maskSecretLast4('mnop')).not.toContain('abcdefgh');
  });
});
