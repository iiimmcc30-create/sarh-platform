import { X509Certificate, createHash } from 'crypto';
import { AppleJwsError, oidToDer, verifyAppleJws } from '../apple/apple-jws';
import {
  APPLE_ROOT_CA_G3_PEM,
  APPLE_ROOT_CA_G3_SHA256,
} from '../apple/apple-root-ca';
import {
  TEST_ROOT_PEM,
  TEST_X5C,
  TEST_X5C_LEAF_WITHOUT_MARKER,
} from './apple-test-chain.fixture';
import { b64url, signTestJws } from './apple-test-helpers';

const trusted = { trustedRootsPem: [TEST_ROOT_PEM] };

describe('verifyAppleJws', () => {
  it('embeds the real Apple Root CA G3', () => {
    const cert = new X509Certificate(APPLE_ROOT_CA_G3_PEM);
    const fp = createHash('sha256')
      .update(cert.raw)
      .digest('hex')
      .toUpperCase();
    expect(fp).toBe(APPLE_ROOT_CA_G3_SHA256.replace(/:/g, ''));
    expect(cert.subject).toContain('Apple Root CA - G3');
  });

  it('encodes OIDs as DER', () => {
    expect(oidToDer('1.2.840.113635.100.6.11.1').toString('hex')).toBe(
      '060a2a864886f76364060b01',
    );
  });

  it('accepts a correctly signed JWS from a trusted chain', () => {
    const jws = signTestJws({
      transactionId: '1000',
      bundleId: 'com.sarh.app',
    });
    expect(verifyAppleJws(jws, trusted)).toEqual({
      transactionId: '1000',
      bundleId: 'com.sarh.app',
    });
  });

  it('rejects a chain that does not end at the Apple root (default trust)', () => {
    const jws = signTestJws({ transactionId: '1000' });
    expect(() => verifyAppleJws(jws)).toThrow(AppleJwsError);
    try {
      verifyAppleJws(jws);
    } catch (e) {
      expect((e as AppleJwsError).code).toBe('untrusted_root');
    }
  });

  it('rejects a tampered payload', () => {
    const jws = signTestJws({ transactionId: '1000' });
    const [h, , s] = jws.split('.');
    const forged = `${h}.${b64url(JSON.stringify({ transactionId: '9999' }))}.${s}`;
    expect(() => verifyAppleJws(forged, trusted)).toThrow(/signature/);
  });

  it('rejects a leaf without the Apple receipt-signing marker', () => {
    const jws = signTestJws({ a: 1 }, { x5c: TEST_X5C_LEAF_WITHOUT_MARKER });
    expect(() => verifyAppleJws(jws, trusted)).toThrow(/marker/);
  });

  it('rejects non-ES256 and malformed tokens', () => {
    expect(() =>
      verifyAppleJws(signTestJws({ a: 1 }, { alg: 'none' }), trusted),
    ).toThrow(/ES256/);
    expect(() => verifyAppleJws('abc', trusted)).toThrow(/3 parts/);
    expect(() =>
      verifyAppleJws(signTestJws({ a: 1 }, { x5c: [TEST_X5C[0]] }), trusted),
    ).toThrow(/chain/);
  });
});
