import {
  signButcherAccessToken,
  verifyButcherAccessToken,
} from '@/lib/butcher-jwt';

const SECRET = 'test-butcher-jwt-secret-minimum-32-chars!!';

describe('verifyButcherAccessToken', () => {
  it('accepts a valid HS256 butcher token', async () => {
    const token = await signButcherAccessToken({
      secret: SECRET,
      role: 'BUTCHER',
      userId: 'butcher-user-1',
    });
    await expect(verifyButcherAccessToken(token, SECRET)).resolves.toEqual({
      ok: true,
      role: 'BUTCHER',
      userId: 'butcher-user-1',
    });
  });

  it('rejects an invalid signature', async () => {
    const token = await signButcherAccessToken({ secret: SECRET, role: 'BUTCHER' });
    await expect(verifyButcherAccessToken(token, `${SECRET}x`)).resolves.toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects an expired token', async () => {
    const token = await signButcherAccessToken({
      secret: SECRET,
      role: 'BUTCHER',
      expiresInSec: -5,
    });
    await expect(verifyButcherAccessToken(token, SECRET)).resolves.toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('rejects a missing token or secret', async () => {
    const token = await signButcherAccessToken({ secret: SECRET, role: 'BUTCHER' });
    await expect(verifyButcherAccessToken(undefined, SECRET)).resolves.toEqual({
      ok: false,
      reason: 'missing',
    });
    await expect(verifyButcherAccessToken(token, undefined)).resolves.toEqual({
      ok: false,
      reason: 'missing',
    });
    await expect(verifyButcherAccessToken('', SECRET)).resolves.toEqual({
      ok: false,
      reason: 'missing',
    });
    await expect(verifyButcherAccessToken(token, '   ')).resolves.toEqual({
      ok: false,
      reason: 'missing',
    });
  });

  it('rejects a malformed token', async () => {
    await expect(verifyButcherAccessToken('not-a-jwt', SECRET)).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    });
    await expect(verifyButcherAccessToken('a.b', SECRET)).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('rejects a token whose header alg is not HS256 even if HMAC matches', async () => {
    const token = await signButcherAccessToken({
      secret: SECRET,
      role: 'BUTCHER',
      alg: 'none',
    });
    await expect(verifyButcherAccessToken(token, SECRET)).resolves.toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects USER and ADMIN roles', async () => {
    const user = await signButcherAccessToken({ secret: SECRET, role: 'USER' });
    const admin = await signButcherAccessToken({ secret: SECRET, role: 'ADMIN' });
    await expect(verifyButcherAccessToken(user, SECRET)).resolves.toEqual({
      ok: false,
      reason: 'forbidden_role',
    });
    await expect(verifyButcherAccessToken(admin, SECRET)).resolves.toEqual({
      ok: false,
      reason: 'forbidden_role',
    });
  });

  it('rejects a butcher token with an empty userId', async () => {
    const token = await signButcherAccessToken({
      secret: SECRET,
      role: 'BUTCHER',
      userId: '   ',
    });
    await expect(verifyButcherAccessToken(token, SECRET)).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});
