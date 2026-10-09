import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

/**
 * AES-256-GCM for small secrets at rest (admin TOTP seeds).
 * Key: ADMIN_TOTP_ENC_KEY when set (recommended, independent of JWT rotation),
 * otherwise derived from JWT_SECRET.
 */
function key(): Buffer {
  const material =
    process.env.ADMIN_TOTP_ENC_KEY?.trim() ||
    `${process.env.JWT_SECRET ?? ''}:sarh-admin-totp`;
  if (material.length < 16) throw new Error('admin_totp_key_missing');
  return createHash('sha256').update(material).digest();
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv, tag, ct]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

export function openSecret(sealed: string): string {
  const [version, iv, tag, ct] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !ct)
    throw new Error('bad_sealed_secret');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ct, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
