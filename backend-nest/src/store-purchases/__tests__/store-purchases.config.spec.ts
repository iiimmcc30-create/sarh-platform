import {
  normalizePrivateKey,
  parseServiceAccountJson,
  readAppleIapConfig,
  readGooglePlayConfig,
  storeIapEnvWarnings,
} from '../store-purchases.config';

const PEM = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----';

describe('store IAP config', () => {
  it('normalizes .p8 keys given with escaped newlines or base64', () => {
    expect(normalizePrivateKey(PEM.replace(/\n/g, '\\n'))).toBe(PEM);
    expect(normalizePrivateKey(Buffer.from(PEM).toString('base64'))).toBe(PEM);
    expect(normalizePrivateKey('')).toBe('');
  });

  it('parses service-account JSON given raw or base64', () => {
    const json = '{"client_email":"x@y.iam.gserviceaccount.com"}';
    expect(parseServiceAccountJson(json)).toEqual({
      client_email: 'x@y.iam.gserviceaccount.com',
    });
    expect(
      parseServiceAccountJson(Buffer.from(json).toString('base64')),
    ).toEqual({
      client_email: 'x@y.iam.gserviceaccount.com',
    });
    expect(parseServiceAccountJson('nope')).toBeNull();
  });

  it('reads Apple config only when all keys are set; defaults bundle/package', () => {
    expect(readAppleIapConfig({})).toBeNull();
    expect(
      readAppleIapConfig({
        APPLE_IAP_ISSUER_ID: 'i',
        APPLE_IAP_KEY_ID: 'k',
        APPLE_IAP_PRIVATE_KEY: PEM,
      }),
    ).toMatchObject({
      issuerId: 'i',
      keyId: 'k',
      bundleId: 'com.sarh.app',
      appAppleId: null,
    });
    expect(readGooglePlayConfig({}).packageName).toBe('com.sarh.app');
  });

  it('warns (never throws) with names only', () => {
    const warnings = storeIapEnvWarnings({
      APPLE_IAP_ISSUER_ID: 'secret-value',
    });
    expect(warnings.join('\n')).toContain('APPLE_IAP_KEY_ID');
    expect(warnings.join('\n')).not.toContain('secret-value');
    expect(storeIapEnvWarnings({}).length).toBeGreaterThan(0);
  });
});
