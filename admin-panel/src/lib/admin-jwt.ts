const STAFF_ROLES = new Set(['ADMIN', 'MODERATOR']);

export type AdminJwtResult =
  | { ok: true; role: string; userId: string }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad_signature' | 'expired' | 'forbidden_role' };

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto subtle is required to verify admin JWTs');
  }
  const encoded = new TextEncoder().encode(data);
  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await subtle.sign('HMAC', key, encoded);
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyAdminAccessToken(
  token: string | undefined,
  secret: string | undefined,
): Promise<AdminJwtResult> {
  if (!token?.trim()) return { ok: false, reason: 'missing' };
  if (!secret?.trim()) return { ok: false, reason: 'missing' };

  const parts = token.trim().split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };

  const [headerB64, payloadB64, sigB64] = parts;
  let expected: Uint8Array;
  try {
    expected = await hmacSha256(secret, `${headerB64}.${payloadB64}`);
  } catch {
    return { ok: false, reason: 'bad_signature' };
  }

  let actual: Uint8Array;
  try {
    actual = base64UrlToBytes(sigB64);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (!timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(payloadB64)),
    ) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const exp = Number(payload.exp);
  if (!Number.isFinite(exp)) {
    return { ok: false, reason: 'malformed' };
  }
  if (exp * 1000 <= Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  const role = String(payload.role ?? '');
  if (!STAFF_ROLES.has(role)) {
    return { ok: false, reason: 'forbidden_role' };
  }

  return {
    ok: true,
    role,
    userId: String(payload.userId ?? ''),
  };
}

/** Test helper — HS256 access token matching backend claim shape. */
export async function signAdminAccessToken(params: {
  secret: string;
  role: string;
  userId?: string;
  expiresInSec?: number;
}): Promise<string> {
  const header = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
  );
  const now = Math.floor(Date.now() / 1000);
  const payload = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        userId: params.userId ?? 'admin-1',
        username: 'admin',
        role: params.role,
        passwordVersion: 0,
        iat: now,
        exp: now + (params.expiresInSec ?? 3600),
      }),
    ),
  );
  const sig = bytesToBase64Url(
    await hmacSha256(params.secret, `${header}.${payload}`),
  );
  return `${header}.${payload}.${sig}`;
}
