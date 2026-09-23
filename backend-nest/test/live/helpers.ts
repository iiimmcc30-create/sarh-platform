/**
 * Shared helpers for LIVE E2E suites that hit the running backend.
 * These tests perform REAL flows (register via dev-OTP, login, CRUD).
 *
 * Config via env (defaults target local dev stack):
 *   LIVE_API_URL          default http://127.0.0.1:3001
 *   ADMIN_E2E_LOGIN/PASS  default e2e_admin / E2eAdmin!234
 *
 * Dev OTP code is fixed to 123456 when Twilio is not configured.
 */
import request from 'supertest';

export const API = process.env.LIVE_API_URL ?? 'http://127.0.0.1:3001';
export const ADMIN_LOGIN = process.env.ADMIN_E2E_LOGIN ?? 'e2e_admin';
export const ADMIN_PASSWORD = process.env.ADMIN_E2E_PASSWORD ?? 'E2eAdmin!234';
export const DEV_OTP = process.env.DEV_OTP_CODE ?? '123456';

export const agent = () => request(API);

export async function apiReachable(): Promise<boolean> {
  try {
    const res = await request(API).get('/api/health').timeout(6000);
    return res.status === 200 || res.status === 503;
  } catch {
    return false;
  }
}

export function uniqueId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function randomSaudiPhone(): string {
  const n = Math.floor(Math.random() * 9_000_0000) + 1_000_0000; // 8 digits
  return `+96655${String(n).padStart(8, '0').slice(0, 7)}`;
}

export type TestUser = {
  id: string;
  username: string;
  password: string;
  phone: string;
  accessToken: string;
  refreshToken: string;
};

/** Full REAL registration: send-otp → verify-otp (dev code) → register. */
export async function registerUser(prefix = 'e2e'): Promise<TestUser> {
  const phone = randomSaudiPhone();
  const username = `${prefix}_${uniqueId()}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 28);
  const password = 'Passw0rd!23';

  await request(API).post('/api/auth/send-otp').send({ phone });
  const verify = await request(API)
    .post('/api/auth/verify-otp')
    .send({ phone, code: DEV_OTP });
  const phoneToken = verify.body?.data?.phone_token;
  if (!phoneToken) {
    throw new Error(
      `verify-otp did not return phone_token: ${JSON.stringify(verify.body)}`,
    );
  }

  const reg = await request(API).post('/api/auth/register').send({
    phone,
    phone_token: phoneToken,
    displayName: 'E2E User',
    arabicName: 'مستخدم اختبار',
    username,
    password,
  });
  if (reg.status !== 201 && reg.status !== 200) {
    throw new Error(
      `register failed (${reg.status}): ${JSON.stringify(reg.body)}`,
    );
  }
  const data = reg.body.data;
  return {
    id: data.user.id,
    username,
    password,
    phone,
    accessToken: data.access_token ?? data.accessToken,
    refreshToken: data.refresh_token ?? data.refreshToken,
  };
}

export async function loginUser(login: string, password: string) {
  const res = await request(API)
    .post('/api/auth/login')
    .send({ login, password });
  return res;
}

export async function adminToken(): Promise<string> {
  const res = await request(API)
    .post('/api/admin/auth/login')
    .send({ login: ADMIN_LOGIN, password: ADMIN_PASSWORD });
  if (res.status !== 200) {
    throw new Error(
      `admin login failed (${res.status}): ${JSON.stringify(res.body)}`,
    );
  }
  return res.body.data.accessToken;
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Sample valid create-listing payload (all required fields). */
export function sampleListing(overrides: Record<string, unknown> = {}) {
  return {
    title: 'E2E Camel Listing',
    arabicTitle: 'إعلان جمل اختبار',
    description: 'A healthy camel offered for automated E2E testing purposes.',
    arabicDescription: 'جمل سليم معروض لأغراض اختبار آلي شامل للتطبيق.',
    price: 5000,
    category: 'camels',
    weightKg: 50,
    location: 'Riyadh',
    arabicLocation: 'الرياض',
    country: 'SA',
    images: ['https://cdn.sarh.app/e2e/a.jpg'],
    ...overrides,
  };
}

export function samplePost(overrides: Record<string, unknown> = {}) {
  return {
    content: 'E2E automated post content',
    arabicContent: 'منشور اختبار آلي',
    ...overrides,
  };
}
