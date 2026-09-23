/**
 * Live Network International (N-Genius) connectivity + order creation.
 * Usage: node scripts/test-ni-gateway.js
 *
 * Reads NI_* from .env. Creates a 1.00 SAR hosted checkout (no card charge).
 */
require('dotenv').config();
const axios = require('axios');

const OUTLET = (process.env.NI_OUTLET_ID || '').trim();
const BASE = (process.env.NI_BASE_URL || 'https://api-gateway.ksa.ngenius-payments.com')
  .replace(/\/+$/, '')
  .replace(/\/networkapi$/i, '');
const REALM = process.env.NI_REALM?.trim() || 'ni';

function basicAuthHeader() {
  const pre = process.env.NI_BASIC_AUTH?.trim();
  if (pre) return pre.startsWith('Basic ') ? pre : `Basic ${pre}`;
  const key = process.env.NI_API_KEY?.trim() || '';
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

async function getToken() {
  const attempts = [
    { grant_type: 'client_credentials', realm: REALM },
    { realmName: REALM },
    {},
  ];
  for (const body of attempts) {
    const r = await axios.post(`${BASE}/identity/auth/access-token`, body, {
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/vnd.ni-identity.v1+json',
        Accept: 'application/vnd.ni-identity.v1+json',
      },
      timeout: 15000,
      validateStatus: () => true,
    });
    if (r.data?.access_token) return r.data.access_token;
  }
  throw new Error('NI access token failed');
}

async function main() {
  if (!OUTLET) {
    console.error('FAIL: NI_OUTLET_ID is not set');
    process.exit(1);
  }

  console.log('BASE  ', BASE);
  console.log('OUTLET', OUTLET);
  console.log('REALM ', REALM);

  const token = await getToken();
  console.log('AUTH  OK');

  const merchantRef = `sarh-gateway-test-${Date.now()}`;
  const orderRes = await axios.post(
    `${BASE}/transactions/outlets/${OUTLET}/orders`,
    {
      action: 'PURCHASE',
      amount: { currencyCode: 'SAR', value: 100 },
      merchantAttributes: {
        redirectUrl: 'https://sarhsa.online/payment/result',
        cancelUrl: 'https://sarhsa.online/payment/cancel',
        merchantOrderReference: merchantRef,
        skipConfirmationPage: true,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/vnd.ni-payment.v2+json',
        Accept: 'application/vnd.ni-payment.v2+json',
      },
      timeout: 20000,
      validateStatus: () => true,
    },
  );

  const data = orderRes.data || {};
  const links = data._links || {};
  const checkout =
    links.payment?.href ||
    links['payment:card']?.href ||
    data.paymentLink ||
    data.url;

  console.log('ORDER', orderRes.status, data.reference || data._id || '');
  console.log('CHECKOUT', checkout || '(none)');

  if (orderRes.status >= 400 || !checkout) {
    console.error('FAIL', JSON.stringify(data).slice(0, 600));
    process.exit(2);
  }

  console.log('GATEWAY_OK');
}

main().catch((err) => {
  console.error('FATAL', err.message);
  process.exit(1);
});
