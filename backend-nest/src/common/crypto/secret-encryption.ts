import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGO = 'aes-256-gcm';

export function resolveSecretsEncryptionKey(): Buffer {
  const dedicated = process.env.SECRETS_ENCRYPTION_KEY?.trim();
  if (dedicated && dedicated.length >= 32) {
    return createHash('sha256').update(dedicated).digest();
  }
  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
      'SECRETS_ENCRYPTION_KEY or JWT_SECRET (32+ chars) is required to encrypt secrets',
    );
  }
  return createHash('sha256').update(`sarh-daftra-v1:${jwtSecret}`).digest();
}

export function encryptSecret(plaintext: string): {
  ciphertext: string;
  iv: string;
  tag: string;
} {
  const key = resolveSecretsEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptSecret(input: {
  ciphertext: string;
  iv: string;
  tag: string;
}): string {
  const key = resolveSecretsEncryptionKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(input.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(input.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function maskSecretLast4(last4: string): string {
  const tail = last4.replace(/[^a-zA-Z0-9]/g, '').slice(-4);
  if (!tail) return '••••';
  return `••••••••••••${tail}`;
}

export function secretLast4(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 4) return trimmed;
  return trimmed.slice(-4);
}
