import { X509Certificate, createHash, verify as cryptoVerify } from 'crypto';
import { APPLE_ROOT_CA_G3_PEM } from './apple-root-ca';

/** Marker OIDs Apple puts on the App Store receipt-signing chain. */
const OID_LEAF_RECEIPT_SIGNING = '1.2.840.113635.100.6.11.1';
const OID_INTERMEDIATE_WWDR = '1.2.840.113635.100.6.2.1';

export class AppleJwsError extends Error {
  constructor(
    public readonly code:
      | 'malformed'
      | 'unsupported_alg'
      | 'bad_chain'
      | 'untrusted_root'
      | 'cert_expired'
      | 'bad_signature',
    message: string,
  ) {
    super(message);
    this.name = 'AppleJwsError';
  }
}

function b64urlDecode(part: string): Buffer {
  return Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** DER encoding of an OBJECT IDENTIFIER (tag + length + body). */
export function oidToDer(oid: string): Buffer {
  const parts = oid.split('.').map((n) => Number(n));
  const body: number[] = [parts[0] * 40 + parts[1]];
  for (const value of parts.slice(2)) {
    const stack: number[] = [value & 0x7f];
    let v = Math.floor(value / 128);
    while (v > 0) {
      stack.unshift((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    body.push(...stack);
  }
  return Buffer.from([0x06, body.length, ...body]);
}

function hasExtensionOid(cert: X509Certificate, oid: string): boolean {
  return cert.raw.includes(oidToDer(oid));
}

function fingerprint(cert: X509Certificate): string {
  return createHash('sha256').update(cert.raw).digest('hex');
}

export type AppleJwsOptions = {
  /** Trusted root PEMs (default: Apple Root CA - G3). Tests pass their own. */
  trustedRootsPem?: string[];
  /** Time used for certificate validity (default: now). */
  now?: Date;
};

/**
 * Verifies an Apple-signed JWS (StoreKit 2 transaction / renewal info, or an
 * App Store Server Notification V2 `signedPayload`) offline:
 *  1. ES256 header with an x5c chain [leaf, intermediate, root];
 *  2. the root is byte-identical to a trusted Apple root;
 *  3. leaf <- intermediate <- root signatures, validity dates and Apple's
 *     marker OIDs on leaf and intermediate;
 *  4. the JWS signature with the leaf public key.
 * Returns the decoded payload. Throws AppleJwsError otherwise.
 */
export function verifyAppleJws<T = Record<string, unknown>>(
  jws: string,
  options: AppleJwsOptions = {},
): T {
  if (typeof jws !== 'string') {
    throw new AppleJwsError('malformed', 'JWS must be a string');
  }
  const parts = jws.split('.');
  if (parts.length !== 3 || parts.some((p) => !p)) {
    throw new AppleJwsError('malformed', 'JWS must have 3 parts');
  }
  let header: { alg?: string; x5c?: string[] };
  let payload: T;
  try {
    header = JSON.parse(b64urlDecode(parts[0]).toString('utf8')) as {
      alg?: string;
      x5c?: string[];
    };
    payload = JSON.parse(b64urlDecode(parts[1]).toString('utf8')) as T;
  } catch {
    throw new AppleJwsError('malformed', 'JWS header/payload is not JSON');
  }
  if (header.alg !== 'ES256') {
    throw new AppleJwsError('unsupported_alg', 'Only ES256 is accepted');
  }
  if (!Array.isArray(header.x5c) || header.x5c.length < 3) {
    throw new AppleJwsError('bad_chain', 'x5c chain must have 3 certificates');
  }

  let leaf: X509Certificate;
  let intermediate: X509Certificate;
  let root: X509Certificate;
  try {
    [leaf, intermediate, root] = header.x5c
      .slice(0, 3)
      .map((der) => new X509Certificate(Buffer.from(der, 'base64')));
  } catch {
    throw new AppleJwsError('bad_chain', 'x5c certificate cannot be parsed');
  }

  const trusted = (options.trustedRootsPem ?? [APPLE_ROOT_CA_G3_PEM]).map(
    (pem) => fingerprint(new X509Certificate(pem)),
  );
  if (!trusted.includes(fingerprint(root))) {
    throw new AppleJwsError(
      'untrusted_root',
      'Root is not a trusted Apple root',
    );
  }

  const now = options.now ?? new Date();
  for (const cert of [leaf, intermediate, root]) {
    if (new Date(cert.validFrom) > now || new Date(cert.validTo) < now) {
      throw new AppleJwsError(
        'cert_expired',
        'Certificate outside its validity',
      );
    }
  }
  if (
    !intermediate.checkIssued(root) ||
    !intermediate.verify(root.publicKey) ||
    !leaf.checkIssued(intermediate) ||
    !leaf.verify(intermediate.publicKey)
  ) {
    throw new AppleJwsError('bad_chain', 'Certificate chain does not verify');
  }
  if (
    !hasExtensionOid(leaf, OID_LEAF_RECEIPT_SIGNING) ||
    !hasExtensionOid(intermediate, OID_INTERMEDIATE_WWDR)
  ) {
    throw new AppleJwsError('bad_chain', 'Missing Apple marker extensions');
  }

  const signature = b64urlDecode(parts[2]);
  const ok = cryptoVerify(
    'sha256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    { key: leaf.publicKey, dsaEncoding: 'ieee-p1363' },
    signature,
  );
  if (!ok) throw new AppleJwsError('bad_signature', 'JWS signature mismatch');
  return payload;
}
