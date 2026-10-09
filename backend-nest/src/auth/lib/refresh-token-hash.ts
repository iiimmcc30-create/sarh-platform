import crypto from 'crypto';

/**
 * Refresh tokens are never stored in clear. `UserSession.refreshToken` holds
 * the SHA-256 hex digest of the JWT (64 hex chars). Rows written before this
 * change still hold the raw JWT; they are matched as a legacy fallback and
 * re-hashed on their next rotation, so nobody is signed out by the deploy.
 * A JWT always contains dots, so it can never collide with a hex digest.
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Values a stored `refreshToken` column may hold for this token (hash first, legacy plaintext second). */
export function refreshTokenLookupValues(token: string): string[] {
  return [hashRefreshToken(token), token];
}

/** True when the stored column value belongs to `token` (hashed or legacy plaintext). */
export function storedRefreshTokenMatches(
  stored: string | null | undefined,
  token: string,
): boolean {
  if (!stored || !token) return false;
  return stored === token || stored === hashRefreshToken(token);
}

/** True when the stored column value is a pre-hash (plaintext JWT) legacy row. */
export function isLegacyPlaintextRefreshToken(stored: string): boolean {
  return !/^[0-9a-f]{64}$/.test(stored);
}

/** How long the token a rotation replaced keeps working (lost response, concurrent refresh). */
export const REFRESH_REUSE_GRACE_MS = 30_000;

function graceKey(token: string): Buffer {
  return crypto
    .createHash('sha256')
    .update('sarh:refresh-grace:v1:', 'utf8')
    .update(token, 'utf8')
    .digest();
}

/**
 * Seal the pair a rotation issued so a replay of the *previous* token inside
 * the grace window can get the very same pair back. The key is derived from
 * the previous token itself, so only its holder can open it (the Redis entry
 * and the DB hash alone are useless).
 */
export function sealGracePair(
  previousToken: string,
  pair: { accessToken: string; refreshToken: string },
): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    graceKey(previousToken),
    iv,
  );
  const body = Buffer.concat([
    cipher.update(JSON.stringify(pair), 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), body]
    .map((b) => b.toString('base64url'))
    .join('.');
}

export function openGracePair(
  previousToken: string,
  sealed: string,
): { accessToken: string; refreshToken: string } | null {
  try {
    const [iv, tag, body] = sealed
      .split('.')
      .map((p) => Buffer.from(p, 'base64url'));
    if (!iv || !tag || !body) return null;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      graceKey(previousToken),
      iv,
    );
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([
      decipher.update(body),
      decipher.final(),
    ]).toString('utf8');
    const pair = JSON.parse(plain) as {
      accessToken?: unknown;
      refreshToken?: unknown;
    };
    if (
      typeof pair.accessToken !== 'string' ||
      typeof pair.refreshToken !== 'string'
    ) {
      return null;
    }
    return { accessToken: pair.accessToken, refreshToken: pair.refreshToken };
  } catch {
    return null;
  }
}
