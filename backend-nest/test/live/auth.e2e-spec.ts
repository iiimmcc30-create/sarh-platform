/**
 * §1 Registration & Login — LIVE E2E against real backend.
 */
import request from 'supertest';
import {
  API,
  DEV_OTP,
  apiReachable,
  authHeader,
  registerUser,
  randomSaudiPhone,
  uniqueId,
  type TestUser,
} from './helpers';

describe('§1 Auth: registration, OTP, login, session, security', () => {
  let live = false;
  let user: TestUser;

  beforeAll(async () => {
    live = await apiReachable();
    if (!live) console.warn(`[live] API not reachable at ${API} — skipping §1`);
  });

  const t = (name: string, fn: () => Promise<void>) =>
    it(name, async () => {
      if (!live) return;
      await fn();
    });

  // ── OTP send ────────────────────────────────────────────────
  t('send-otp with a valid phone succeeds', async () => {
    const res = await request(API)
      .post('/api/auth/send-otp')
      .send({ phone: randomSaudiPhone() });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  t('send-otp with invalid phone → 400', async () => {
    const res = await request(API)
      .post('/api/auth/send-otp')
      .send({ phone: 'not-a-phone' });
    expect(res.status).toBe(400);
  });

  t('send-otp with empty body → 400', async () => {
    const res = await request(API).post('/api/auth/send-otp').send({});
    expect(res.status).toBe(400);
  });

  // ── OTP verify ──────────────────────────────────────────────
  t('verify-otp with wrong code → 400', async () => {
    const phone = randomSaudiPhone();
    await request(API).post('/api/auth/send-otp').send({ phone });
    const res = await request(API)
      .post('/api/auth/verify-otp')
      .send({ phone, code: '000000' });
    expect(res.status).toBe(400);
  });

  t('verify-otp empty code → 400', async () => {
    const res = await request(API)
      .post('/api/auth/verify-otp')
      .send({ phone: randomSaudiPhone(), code: '' });
    expect(res.status).toBe(400);
  });

  t(
    'verify-otp valid → phone_token + is_new_user for unused number',
    async () => {
      const phone = randomSaudiPhone();
      await request(API).post('/api/auth/send-otp').send({ phone });
      const res = await request(API)
        .post('/api/auth/verify-otp')
        .send({ phone, code: DEV_OTP });
      expect(res.status).toBe(200);
      expect(res.body.data.phone_token).toBeTruthy();
      expect(res.body.data.is_new_user).toBe(true);
    },
  );

  // ── Registration ────────────────────────────────────────────
  t('full registration creates account and returns tokens', async () => {
    user = await registerUser('e2e_auth');
    expect(user.id).toBeTruthy();
    expect(user.accessToken).toBeTruthy();
    expect(user.refreshToken).toBeTruthy();
  });

  t('registration with duplicate username is rejected', async () => {
    const phone = randomSaudiPhone();
    await request(API).post('/api/auth/send-otp').send({ phone });
    const verify = await request(API)
      .post('/api/auth/verify-otp')
      .send({ phone, code: DEV_OTP });
    const res = await request(API).post('/api/auth/register').send({
      phone,
      phone_token: verify.body.data.phone_token,
      displayName: 'Dup',
      username: user.username,
      password: 'Passw0rd!23',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });

  t('registration with missing fields → 400', async () => {
    const res = await request(API)
      .post('/api/auth/register')
      .send({ phone: randomSaudiPhone() });
    expect(res.status).toBe(400);
  });

  // ── Login ───────────────────────────────────────────────────
  t('login with correct credentials succeeds', async () => {
    const res = await request(API).post('/api/auth/login').send({
      login: user.username,
      password: user.password,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  t('login with wrong password → 401', async () => {
    const res = await request(API).post('/api/auth/login').send({
      login: user.username,
      password: 'totally-wrong',
    });
    expect(res.status).toBe(401);
  });

  t('login with unknown user → 401', async () => {
    const res = await request(API)
      .post('/api/auth/login')
      .send({
        login: `ghost_${uniqueId()}`,
        password: 'whatever12',
      });
    expect(res.status).toBe(401);
  });

  // ── Refresh / session ───────────────────────────────────────
  t('refresh token returns a new access token', async () => {
    const res = await request(API)
      .post('/api/auth/refresh')
      .send({ refreshToken: user.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  t('refresh with invalid token → 401', async () => {
    const res = await request(API)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid.refresh.token' });
    expect(res.status).toBe(401);
  });

  t('session persists: access token authorizes a protected route', async () => {
    const res = await request(API)
      .get('/api/notifications/unread-count')
      .set(authHeader(user.accessToken));
    expect(res.status).toBe(200);
  });

  // ── Change password ─────────────────────────────────────────
  t('change-password with wrong current password is rejected', async () => {
    const res = await request(API)
      .post('/api/auth/change-password')
      .set(authHeader(user.accessToken))
      .send({ currentPassword: 'definitely-wrong', newPassword: 'NewPass123' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  t('change-password with valid current password succeeds', async () => {
    const res = await request(API)
      .post('/api/auth/change-password')
      .set(authHeader(user.accessToken))
      .send({ currentPassword: user.password, newPassword: 'NewPass123!' });
    expect([200, 201]).toContain(res.status);
  });

  // ── Security / tokens ───────────────────────────────────────
  t('protected route without token → 401', async () => {
    const res = await request(API).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  t('protected route with malformed token → 401', async () => {
    const res = await request(API)
      .get('/api/notifications')
      .set(authHeader('bad.token.value'));
    expect(res.status).toBe(401);
  });

  t('reset-password OTP for unknown phone → 404', async () => {
    const phone = randomSaudiPhone();
    await request(API).post('/api/auth/send-otp').send({ phone });
    const res = await request(API)
      .post('/api/auth/verify-otp')
      .send({ phone, code: DEV_OTP, purpose: 'reset_password' });
    expect(res.status).toBe(404);
  });

  // ── Logout ──────────────────────────────────────────────────
  t('logout succeeds for an authenticated user', async () => {
    const fresh = await registerUser('e2e_logout');
    const res = await request(API)
      .post('/api/auth/logout')
      .set(authHeader(fresh.accessToken))
      .send({ refreshToken: fresh.refreshToken });
    expect(res.status).toBe(200);
  });
});
